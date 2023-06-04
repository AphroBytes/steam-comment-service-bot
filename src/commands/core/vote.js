/*
 * File: vote.js
 * Project: steam-comment-service-bot
 * Created Date: 28.05.2023 12:02:24
 * Author: 3urobeat
 *
 * Last Modified: 02.06.2023 14:46:29
 * Modified By: 3urobeat
 *
 * Copyright (c) 2023 3urobeat <https://github.com/HerrEurobeat>
 *
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
 */


const CommandHandler = require("../commandHandler.js"); // eslint-disable-line
const { getSharedfileArgs }         = require("../helpers/getSharedfileArgs.js");
const { getAvailableBotsForVoting } = require("../helpers/getVoteBots.js");
const { syncLoop, timeToString }    = require("../../controller/helpers/misc.js");
const { logVoteError }              = require("../helpers/handleSharedfileErrors.js");


module.exports.upvote = {
    names: ["upvote"],
    description: "Upvotes a sharedfile",
    ownersOnly: false,

    /**
     * The upvote command
     * @param {CommandHandler} commandHandler The commandHandler object
     * @param {Array} args Array of arguments that will be passed to the command
     * @param {string} steamID64 Steam ID of the user that executed this command
     * @param {function(object, object, string)} respondModule Function that will be called to respond to the user's request. Passes context, resInfo and txt as parameters.
     * @param {object} context The context (this.) of the object calling this command. Will be passed to respondModule() as first parameter.
     * @param {object} resInfo Object containing additional information your respondModule might need to process the response (for example the userID who executed the command).
     */
    run: async (commandHandler, args, steamID64, respondModule, context, resInfo) => {
        let respond = ((txt) => respondModule(context, resInfo, txt)); // Shorten each call

        let requesterSteamID64 = steamID64;
        let ownercheck         = commandHandler.data.cachefile.ownerid.includes(requesterSteamID64);


        /* --------- Check for disabled cmd or if update is queued --------- */
        if (commandHandler.controller.info.readyAfter == 0)             return respondModule(context, { prefix: "/me", ...resInfo }, commandHandler.data.lang.botnotready); // Bot isn't fully started yet - Pass new resInfo object which contains prefix and everything the original resInfo obj contained
        if (commandHandler.controller.info.activeLogin)                 return respond(commandHandler.data.lang.activerelog);      // Bot is waiting for relog
        if (commandHandler.data.config.maxComments == 0 && !ownercheck) return respond(commandHandler.data.lang.commandowneronly); // Command is restricted to owners only


        // Check and get arguments from user
        let { amountRaw, id } = await getSharedfileArgs(commandHandler, args, "upvote", respond);

        if (!amountRaw && !id) return; // Looks like the helper aborted the request


        // Check if this id is already receiving something right now
        let idReq = commandHandler.controller.activeRequests[id];

        if (idReq && idReq.status == "active") return respond(commandHandler.data.lang.idalreadyreceiving); // Note: No need to check for user as that is supposed to be handled by a cooldown


        // Check if user has cooldown
        let { until, untilStr } = await commandHandler.data.getUserCooldown(requesterSteamID64);

        if (until > Date.now()) return respond(commandHandler.data.lang.idoncooldown.replace("remainingcooldown", untilStr));


        // Get all available bot accounts
        let { amount, availableAccounts, whenAvailableStr } = await getAvailableBotsForVoting(commandHandler, amountRaw, id, "upvote");

        if ((availableAccounts.length < amount || availableAccounts.length == 0) && !whenAvailableStr) { // Check if this bot has not enough accounts suitable for this request and there won't be more available at any point.
            if (availableAccounts.length == 0) respond(commandHandler.data.lang.votenoaccounts);         // The < || == 0 check is intentional, as providing "all" will set amount to 0 if 0 accounts have been found
                else respond(commandHandler.data.lang.voterequestless.replace("availablenow", availableAccounts.length));

            return;
        }

        if (availableAccounts.length < amount) { // Check if not enough available accounts were found because of cooldown
            respond(commandHandler.data.lang.votenotenoughavailableaccs.replace("waittime", whenAvailableStr).replace("availablenow", availableAccounts.length));
            return;
        }


        // Get the sharedfile
        commandHandler.controller.main.community.getSteamSharedfile(id, (err, sharedfile) => {
            if (err) {
                respond(commandHandler.data.lang.errloadingsharedfile + err);
                return;
            }


            // Register this vote process in activeRequests. We use commentdelay here for now, not sure if I'm going to add a separate setting
            commandHandler.controller.activeRequests[id] = {
                status: "active",
                type: "upvote",
                amount: amount,
                requestedby: requesterSteamID64,
                accounts: availableAccounts,
                thisIteration: -1, // Set to -1 so that first iteration will increase it to 0
                retryAttempt: 0,
                until: Date.now() + ((amount - 1) * commandHandler.data.config.commentdelay), // Calculate estimated wait time (first vote is instant -> remove 1 from numberOfComments)
                failed: {}
            };

            let activeReqEntry = commandHandler.controller.activeRequests[id]; // Make using the obj shorter


            // Start voting with all available accounts
            syncLoop(amount, (loop, i) => {
                setTimeout(() => {

                    let bot = commandHandler.controller.bots[availableAccounts[i]];
                    activeReqEntry.thisIteration++;

                    // TODO: Error handling that skips iterations?

                    /* --------- Try to vote --------- */
                    bot.community.voteUpSharedfile(sharedfile.id, (error) => {

                        /* --------- Handle errors thrown by this vote attempt or update ratingHistory db --------- */
                        if (error) {
                            logVoteError(error, commandHandler, bot, sharedfile.id);

                        } else {

                            // Add upvote entry
                            commandHandler.data.ratingHistoryDB.insert({ id: id, accountName: activeReqEntry.accounts[i], type: "upvote", time: Date.now() }, (err) => {
                                if (err) logger("warn", `Failed to insert 'upvote' entry for '${activeReqEntry.accounts[i]}' on '${id}' into ratingHistory database! Error: ` + err);
                            });

                            // Remove downvote entry
                            commandHandler.data.ratingHistoryDB.remove({ id: id, accountName: activeReqEntry.accounts[i], type: "downvote" }, (err) => {
                                if (err) logger("warn", `Failed to remove 'downvote' entry for '${activeReqEntry.accounts[i]}' on '${id}' from ratingHistory database! Error: ` + err);
                            });
                        }


                        /* --------- No error, run this on every successful iteration --------- */
                        if (activeReqEntry.thisIteration == 0) { // Stuff below should only run in first iteration
                            if (commandHandler.data.proxies.length > 1) logger("info", `${logger.colors.fggreen}[${bot.logPrefix}] ${activeReqEntry.amount} Upvote(s) requested. Voting on ${id} with proxy ${bot.loginData.proxyIndex}...`);
                                else logger("info", `${logger.colors.fggreen}[${bot.logPrefix}] ${activeReqEntry.amount} Upvote(s) requested. Voting on ${id}...`);


                            // Only send estimated wait time message for multiple votes
                            if (activeReqEntry.amount > 1) {
                                let waitTime = timeToString(Date.now() + ((activeReqEntry.amount - 1) * commandHandler.data.config.commentdelay)); // Amount - 1 because the first vote is instant. Multiply by delay and add to current time to get timestamp when last vote was sent

                                respond(commandHandler.data.lang.voteprocessstarted.replace("numberOfVotes", activeReqEntry.amount).replace("waittime", waitTime));
                            }


                            // Give requesting user cooldown. Set timestamp to now if cooldown is disabled to avoid issues when a process is aborted but cooldown can't be cleared
                            if (commandHandler.data.config.commentcooldown == 0) commandHandler.data.setUserCooldown(activeReqEntry.requestedby, Date.now());
                                else commandHandler.data.setUserCooldown(activeReqEntry.requestedby, activeReqEntry.until);

                        } else { // Stuff below should run for every iteration that is not the first one

                            if (!error) {
                                if (commandHandler.data.proxies.length > 1) logger("info", `[${bot.logPrefix}] Upvoting ${activeReqEntry.thisIteration + 1}/${activeReqEntry.amount} on ${id} with proxy ${bot.loginData.proxyIndex}...`);
                                    else logger("info", `[${bot.logPrefix}] Upvoting ${activeReqEntry.thisIteration + 1}/${activeReqEntry.amount} on ${id}...`);
                            }
                        }


                        // Continue with the next iteration
                        loop.next();

                    });

                }, commandHandler.data.config.commentdelay * (i > 0)); // We use commentdelay here for now, not sure if I'm going to add a separate setting

            }, () => { // Function that will run on exit, aka the last iteration: Respond to the user

                /* ------------- Send finished message for corresponding status -------------  */
                if (activeReqEntry.status == "aborted") {

                    respond(commandHandler.data.lang.requestaborted.replace("successAmount", activeReqEntry.amount - Object.keys(activeReqEntry.failed).length).replace("totalAmount", activeReqEntry.amount));

                } else {

                    // Add reference to !failed command to finished message if at least one vote failed
                    let failedcmdreference = "";

                    if (Object.keys(commandHandler.controller.activeRequests[id].failed).length > 0) {
                        failedcmdreference = "\nTo get detailed information why which request failed please type '!failed'. You can read why your error was probably caused here: https://github.com/HerrEurobeat/steam-comment-service-bot/wiki/Errors,-FAQ-&-Common-problems";
                    }

                    // Send finished message
                    respond(`${commandHandler.data.lang.votesuccess.replace("failedamount", Object.keys(activeReqEntry.failed).length).replace("numberOfVotes", activeReqEntry.amount)}\n${failedcmdreference}`);

                    // Set status of this request to cooldown and add amount of successful comments to our global commentCounter
                    activeReqEntry.status = "cooldown";

                }

            });
        });
    }
};


module.exports.downvote = {
    names: ["downvote"],
    description: "Downvotes a sharedfile",
    ownersOnly: true, // I would like to prevent users from abusing this feature to dislike other peoples creations

    /**
     * The upvote command
     * @param {CommandHandler} commandHandler The commandHandler object
     * @param {Array} args Array of arguments that will be passed to the command
     * @param {string} steamID64 Steam ID of the user that executed this command
     * @param {function(object, object, string)} respondModule Function that will be called to respond to the user's request. Passes context, resInfo and txt as parameters.
     * @param {Object} context The context (this.) of the object calling this command. Will be passed to respondModule() as first parameter.
     * @param {Object} resInfo Object containing additional information your respondModule might need to process the response (for example the userID who executed the command).
     */
    run: async (commandHandler, args, steamID64, respondModule, context, resInfo) => {
        let respond = ((txt) => respondModule(context, resInfo, txt)); // Shorten each call

        let requesterSteamID64 = steamID64;
        let ownercheck         = commandHandler.data.cachefile.ownerid.includes(requesterSteamID64);


        /* --------- Check for disabled cmd or if update is queued --------- */
        if (commandHandler.controller.info.readyAfter == 0)             return respondModule(context, { prefix: "/me", ...resInfo }, commandHandler.data.lang.botnotready); // Bot isn't fully started yet - Pass new resInfo object which contains prefix and everything the original resInfo obj contained
        if (commandHandler.controller.info.activeLogin)                 return respond(commandHandler.data.lang.activerelog);      // Bot is waiting for relog
        if (commandHandler.data.config.maxComments == 0 && !ownercheck) return respond(commandHandler.data.lang.commandowneronly); // Command is restricted to owners only


        // Check and get arguments from user
        let { amountRaw, id } = await getSharedfileArgs(commandHandler, args, "downvote", respond);

        if (!amountRaw && !id) return; // Looks like the helper aborted the request


        // Check if this id is already receiving something right now
        let idReq = commandHandler.controller.activeRequests[id];

        if (idReq && idReq.status == "active") return respond(commandHandler.data.lang.idalreadyreceiving); // Note: No need to check for user as that is supposed to be handled by a cooldown


        // Check if user has cooldown
        let { until, untilStr } = await commandHandler.data.getUserCooldown(requesterSteamID64);

        if (until > Date.now()) return respond(commandHandler.data.lang.idoncooldown.replace("remainingcooldown", untilStr));


        // Get all available bot accounts
        let { amount, availableAccounts, whenAvailableStr } = await getAvailableBotsForVoting(commandHandler, amountRaw, id, "downvote");

        if ((availableAccounts.length < amount || availableAccounts.length == 0) && !whenAvailableStr) { // Check if this bot has not enough accounts suitable for this request and there won't be more available at any point.
            if (availableAccounts.length == 0) respond(commandHandler.data.lang.votenoaccounts);         // The < || == 0 check is intentional, as providing "all" will set amount to 0 if 0 accounts have been found
                else respond(commandHandler.data.lang.voterequestless.replace("availablenow", availableAccounts.length));

            return;
        }

        if (availableAccounts.length < amount) { // Check if not enough available accounts were found because of cooldown
            respond(commandHandler.data.lang.votenotenoughavailableaccs.replace("waittime", whenAvailableStr).replace("availablenow", availableAccounts.length));
            return;
        }


        // Get the sharedfile
        commandHandler.controller.main.community.getSteamSharedfile(id, (err, sharedfile) => {
            if (err) {
                respond(commandHandler.data.lang.errloadingsharedfile + err);
                return;
            }


            // Register this vote process in activeRequests. We use commentdelay here for now, not sure if I'm going to add a separate setting
            commandHandler.controller.activeRequests[id] = {
                status: "active",
                type: "downvote",
                amount: amount,
                requestedby: requesterSteamID64,
                accounts: availableAccounts,
                thisIteration: -1, // Set to -1 so that first iteration will increase it to 0
                retryAttempt: 0,
                until: Date.now() + ((amount - 1) * commandHandler.data.config.commentdelay), // Calculate estimated wait time (first vote is instant -> remove 1 from numberOfComments)
                failed: {}
            };

            let activeReqEntry = commandHandler.controller.activeRequests[id]; // Make using the obj shorter


            // Start voting with all available accounts
            syncLoop(amount, (loop, i) => {
                setTimeout(() => {

                    let bot = commandHandler.controller.bots[availableAccounts[i]];
                    activeReqEntry.thisIteration++;

                    // TODO: Error handling that skips iterations?

                    /* --------- Try to vote --------- */
                    bot.community.voteDownSharedfile(sharedfile.id, (error) => {

                        /* --------- Handle errors thrown by this vote attempt or update ratingHistory db --------- */
                        if (error) {
                            logVoteError(error, commandHandler, bot, sharedfile.id);

                        } else {

                            // Add downvote entry
                            commandHandler.data.ratingHistoryDB.insert({ id: id, accountName: activeReqEntry.accounts[i], type: "downvote", time: Date.now() }, (err) => {
                                if (err) logger("warn", `Failed to insert 'downvote' entry for '${activeReqEntry.accounts[i]}' on '${id}' into ratingHistory database! Error: ` + err);
                            });

                            // Remove upvote entry
                            commandHandler.data.ratingHistoryDB.remove({ id: id, accountName: activeReqEntry.accounts[i], type: "upvote" }, (err) => {
                                if (err) logger("warn", `Failed to remove 'upvote' entry for '${activeReqEntry.accounts[i]}' on '${id}' from ratingHistory database! Error: ` + err);
                            });
                        }


                        /* --------- No error, run this on every successful iteration --------- */
                        if (activeReqEntry.thisIteration == 0) { // Stuff below should only run in first iteration
                            if (commandHandler.data.proxies.length > 1) logger("info", `${logger.colors.fggreen}[${bot.logPrefix}] ${activeReqEntry.amount} Downvote(s) requested. Voting on ${id} with proxy ${bot.loginData.proxyIndex}...`);
                                else logger("info", `${logger.colors.fggreen}[${bot.logPrefix}] ${activeReqEntry.amount} Downvote(s) requested. Voting on ${id}...`);


                            // Only send estimated wait time message for multiple votes
                            if (activeReqEntry.amount > 1) {
                                let waitTime = timeToString(Date.now() + ((activeReqEntry.amount - 1) * commandHandler.data.config.commentdelay)); // Amount - 1 because the first vote is instant. Multiply by delay and add to current time to get timestamp when last vote was sent

                                respond(commandHandler.data.lang.voteprocessstarted.replace("numberOfVotes", activeReqEntry.amount).replace("waittime", waitTime));
                            }


                            // Give requesting user cooldown. Set timestamp to now if cooldown is disabled to avoid issues when a process is aborted but cooldown can't be cleared
                            if (commandHandler.data.config.commentcooldown == 0) commandHandler.data.setUserCooldown(activeReqEntry.requestedby, Date.now());
                                else commandHandler.data.setUserCooldown(activeReqEntry.requestedby, activeReqEntry.until);

                        } else { // Stuff below should run for every iteration that is not the first one

                            if (!error) {
                                if (commandHandler.data.proxies.length > 1) logger("info", `[${bot.logPrefix}] Downvoting ${activeReqEntry.thisIteration + 1}/${activeReqEntry.amount} on ${id} with proxy ${bot.loginData.proxyIndex}...`);
                                    else logger("info", `[${bot.logPrefix}] Downvoting ${activeReqEntry.thisIteration + 1}/${activeReqEntry.amount} on ${id}...`);
                            }
                        }


                        // Continue with the next iteration
                        loop.next();

                    });

                }, commandHandler.data.config.commentdelay * (i > 0)); // We use commentdelay here for now, not sure if I'm going to add a separate setting

            }, () => { // Function that will run on exit, aka the last iteration: Respond to the user

                /* ------------- Send finished message for corresponding status -------------  */
                if (activeReqEntry.status == "aborted") {

                    respond(commandHandler.data.lang.requestaborted.replace("successAmount", activeReqEntry.amount - Object.keys(activeReqEntry.failed).length).replace("totalAmount", activeReqEntry.amount));

                } else {

                    // Add reference to !failed command to finished message if at least one vote failed
                    let failedcmdreference = "";

                    if (Object.keys(commandHandler.controller.activeRequests[id].failed).length > 0) {
                        failedcmdreference = "\nTo get detailed information why which request failed please type '!failed'. You can read why your error was probably caused here: https://github.com/HerrEurobeat/steam-comment-service-bot/wiki/Errors,-FAQ-&-Common-problems";
                    }

                    // Send finished message
                    respond(`${commandHandler.data.lang.votesuccess.replace("failedamount", Object.keys(activeReqEntry.failed).length).replace("numberOfVotes", activeReqEntry.amount)}\n${failedcmdreference}`);

                    // Set status of this request to cooldown and add amount of successful comments to our global commentCounter
                    activeReqEntry.status = "cooldown";

                }

            });
        });
    }
};