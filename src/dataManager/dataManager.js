/*
 * File: dataManager.js
 * Project: steam-comment-service-bot
 * Created Date: 21.03.2023 22:34:51
 * Author: 3urobeat
 *
 * Last Modified: 26.07.2023 16:37:37
 * Modified By: 3urobeat
 *
 * Copyright (c) 2023 3urobeat <https://github.com/3urobeat>
 *
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

const fs = require("fs");
const { default: Nedb } = require("@seald-io/nedb"); // eslint-disable-line

const Controller = require("../controller/controller.js"); // eslint-disable-line

/**
 * Constructor - The dataManager system imports, checks, handles errors and provides a file updating service for all configuration files
 * @class
 * @param {Controller} controller Reference to the controller object
 */
const DataManager = function (controller) {
    /**
     * Reference to the controller object
     * @type {Controller}
     */
    this.controller = controller;

    this.checkAndGetFile = controller.checkAndGetFile;

    /**
     * Stores all `data.json` values.
     * Read only - Do NOT MODIFY anything in this file!
     * @type {{ version: string, versionstr: string, branch: string, filetostart: string, filetostarturl: string, mestr: string, aboutstr: string, firststart: boolean, compatibilityfeaturedone: boolean, whatsnew: string, timesloggedin: number, totallogintime: number }}
     */
    this.datafile = {};

    /**
     * Stores all `config.json` settings.
     * @type {{[key: string]: any}}
     */
    this.config = {};

    /**
     * Stores all `advancedconfig.json` settings.
     * @type {{[key: string]: any}}
     */
    this.advancedconfig = {};

    /**
     * Stores all language strings used for responding to a user.
     * All default strings have already been replaced with corresponding matches from `customlang.json`.
     * @type {{[key: string]: string}}
     */
    this.lang = {};

    /**
     * Stores all quotes used for commenting provided via the `quotes.txt` file.
     * @type {Array.<string>}
     */
    this.quotes = [];

    /**
     * Stores all proxies provided via the `proxies.txt` file.
     * @type {Array.<string>}
     */
    this.proxies = [];

    /**
     * Stores IDs from config files converted at runtime and backups for all config & data files.
     * @type {{ ownerid: Array.<string>, botsgroup: string, botsgroupid: string, configgroup: string, configgroup64id: string, ownerlinkid: string, botaccid: Array.<string>, pluginVersions: {[key: string]: string}, configjson: {}, advancedconfigjson: {}, datajson: {} }}
     */
    this.cachefile = {};

    /**
     * Stores the login information for every bot account provided via the `logininfo.json` or `accounts.txt` files.
     * @type {{[key: string]: { accountName: string, password: string, sharedSecret?: string, steamGuardCode?: null, machineName?: string, deviceFriendlyName?: string }}}
     */
    this.logininfo = {};

    /**
     * Database which stores the timestamp of the last request of every user. This is used to enforce `config.unfriendTime`.
     * Document structure: { id: String, time: Number }
     * @type {Nedb}
     */
    this.lastCommentDB = {};

    /**
     * Database which stores information about which bot accounts have already voted on which sharedfiles. This allows us to filter without pinging Steam for every account on every request.
     * Document structure: { id: String, accountName: String, type: String, time: Number }
     * @type {Nedb}
     */
    this.ratingHistoryDB = {};

    /**
     * Database which stores the refreshTokens for all bot accounts.
     * Document structure: { accountName: String, token: String }
     * @type {Nedb}
     */
    this.tokensDB = {};

    // Stores a reference to the active handleExpiringTokens interval to prevent duplicates on reloads
    this._handleExpiringTokensInterval = null;

    // Dynamically load all helper files
    const loadHelpersFromFolder = (folder) => {
        fs.readdirSync(folder).forEach(async (file) => {
            if (!file.endsWith(".js")) return;

            const path = `${folder}/${file}`;
            const getFile = await this.checkAndGetFile(path, controller.logger);

            if (!getFile) logger("err", `Error! DataManager: Failed to load '${file}'!`);
        });
    };

    loadHelpersFromFolder("./src/dataManager");
    loadHelpersFromFolder("./src/dataManager/helpers");
};

/* -------- Register functions to let the IntelliSense know what's going on in helper files -------- */

/**
 * Checks currently loaded data for validity and logs some recommendations for a few settings.
 * @returns {Promise.<void>} Resolves promise when all checks have finished. If promise is rejected you should terminate the application or reset the changes. Reject is called with a String specifying the failed check.
 */
DataManager.prototype.checkData = function () {};

/**
 * Writes (all) files imported by DataManager back to the disk
 */
DataManager.prototype.writeAllFilesToDisk = function() {};

/**
 * Writes cachefile to cache.json on disk
 */
DataManager.prototype.writeCachefileToDisk = function() {};

/**
 * Writes datafile to data.json on disk
 */
DataManager.prototype.writeDatafileToDisk = function() {};

/**
 * Writes config to config.json on disk
 */
DataManager.prototype.writeConfigToDisk = function() {};

/**
 * Writes advancedconfig to advancedconfig.json on disk
 */
DataManager.prototype.writeAdvancedconfigToDisk = function() {};

/**
 * Writes logininfo to logininfo.json and accounts.txt on disk, depending on which of the files exist
 */
DataManager.prototype.writeLogininfoToDisk = function() {};

/**
 * Writes proxies to proxies.txt on disk
 */
DataManager.prototype.writeProxiesToDisk = function() {};

/**
 * Writes quotes to quotes.txt on disk
 */
DataManager.prototype.writeQuotesToDisk = function() {};

/**
 * Internal: Loads all config & data files from disk and handles potential errors
 * @returns {Promise.<void>} Resolves promise when all files have been loaded successfully. The function will log an error and terminate the application should a fatal error occur.
 */
DataManager.prototype._importFromDisk = async function () {};

/**
 * Converts owners and groups imported from config.json to steam ids and updates cachefile. (Call this after dataImport and before dataCheck)
 */
DataManager.prototype.processData = async function() {};

/**
 * Gets a random quote
 * @param {Array} quotesArr Optional: Custom array of quotes to choose from. If not provided the default quotes set which was imported from the disk will be used.
 * @returns {Promise.<string>} Resolves with `quote` (String)
 */
DataManager.prototype.getQuote = function (quotesArr = null) {}; // eslint-disable-line

/**
 * Checks if a user ID is currently on cooldown and formats human readable lastRequestStr and untilStr strings.
 * @param {string} id ID of the user to look up
 * @returns {Promise.<{ lastRequest: number, until: number, lastRequestStr: string, untilStr: string }|null>} Resolves with object containing `lastRequest` (Unix timestamp of the last interaction received), `until` (Unix timestamp of cooldown end), `lastRequestStr` (How long ago as String), `untilStr` (Wait until as String). If id wasn't found, `null` will be returned.
 */
DataManager.prototype.getUserCooldown = function (id) {}; // eslint-disable-line

/**
 * Updates or inserts timestamp of a user
 * @param {string} id ID of the user to update
 * @param {number} timestamp Unix timestamp of the last interaction the user received
 */
DataManager.prototype.setUserCooldown = function (id, timestamp) {}; // eslint-disable-line

/**
 * Internal: Checks tokens.db every 24 hours for refreshToken expiration in <=7 days, logs warning and sends botowner a Steam msg
 */
DataManager.prototype._startExpiringTokensCheckInterval = () => {};

/**
 * Internal: Asks user if he/she wants to refresh the tokens of all expiring accounts when no active request was found and relogs them
 * @param {object} expiring Object of botobject entries to ask user for
 */
DataManager.prototype._askForGetNewToken = function (expiring) {}; // eslint-disable-line

/**
 * Retrieves the last processed request of anyone or a specific steamID64 from the lastcomment database
 * @param {string} steamID64 Search for a specific user
 * @returns {Promise.<number>} Called with the greatest timestamp (Number) found
 */
DataManager.prototype.getLastCommentRequest = function (steamID64 = null) {}; // eslint-disable-line

/**
 * Decodes a JsonWebToken - https://stackoverflow.com/a/38552302
 * @param {string} token The token to decode
 * @returns {object|null} JWT object on success, `null` on failure
 */
DataManager.prototype.decodeJWT = function (token) {}; // eslint-disable-line

/**
 * Refreshes Backups in cache.json with new data
 */
DataManager.prototype.refreshCache = function () {};

/**
 * Internal: Helper function to try and restore backup of corrupted file from cache.json
 * @param {string} name Name of the file
 * @param {string} filepath Absolute path of the file on the disk
 * @param {object} cacheentry Backup-Object of the file in cache.json
 * @param {string} onlinelink Link to the raw file in the GitHub repository
 * @param {function(any): void} resolve Function to resolve the caller's promise
 */
DataManager.prototype._restoreBackup = function (name, filepath, cacheentry, onlinelink, resolve) {}; // eslint-disable-line

/**
 * Internal: Helper function to pull new file from GitHub
 * @param {string} name Name of the file
 * @param {string} filepath Full path, starting from project root with './'
 * @param {function(any): void} resolve Your promise to resolve when file was pulled
 * @param {boolean} noRequire Optional: Set to true if resolve() should not be called with require(file) as param
 */
DataManager.prototype._pullNewFile = async function (name, filepath, resolve) {}; // eslint-disable-line

// Export our freshly baked bread
module.exports = DataManager;
