/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const express = require('express');
const { CSVPipelineError } = require('./CustomErrors');
const success = require('./success');
const loadCsvInput = require('../pipeline-in-progress/loadCsvInput');
const { TimeSortTypesJS } = require('./validateCsvUploadParams');
const Meter = require('../../models/Meter');
const { log } = require('../../log');

/**
 * Middleware that uploads readings via the pipeline. This should be the final stage of the CSV Pipeline.
 * @param {express.Request} req 
 * @param {express.Response} res 
 * @param {string} filepath Path to readings csv file
 * @param conn 
 * @returns 
 */
async function uploadReadings(req, res, filepath, conn) {
	// TODO update parameter is not currently used
	const { createMeter, headerRow, meterName } = req.body; // extract query parameters
	const hasHeaderRow = (headerRow === 'true');
	let meterCreated = false;
	let meter = await Meter.getByName(meterName, conn)
		.catch(async err => {
			// Meter#getByNames throws an error when no meter is found. We need the catch clause to account for this error.
			if (createMeter !== 'true') {
				// If createMeter is not set to true, we do not know what to do with the readings so we error out.
				throw new CSVPipelineError(
					`User Error: Meter with name '${meterName}' not found. createMeter needs to be set true in order to automatically create meter.`,
					err.message
				);
			} else {
				// If createMeter is true, we will create the meter for the user.
				// The meter type cannot be null. We use MAMAC as a default.
				const tempMeter = new Meter(undefined, meterName, undefined, false, false, Meter.type.MAMAC, undefined, undefined, meterName);
				await tempMeter.insert(conn);
				meterCreated = true;
				log.info('Creating meter ' + tempMeter.name);
				return await Meter.getByName(tempMeter.name, conn); // Get meter from DB after insert because some defaults are set within the DB.
			}
		});
	if (!meterCreated && createMeter === 'true') {
		log.warn('The create meter was set but the meter already existed for meter ' + meter.name);
	}

	// Handle other parameter defaults
	let { cumulative, cumulativeReset, cumulativeResetStart, cumulativeResetEnd, lengthVariation, lengthGap, duplications, timeSort } = req.body;
	let areReadingsCumulative;
	let doReadingsReset;
	let readingResetStart;
	let readingResetEnd;
	let readingGap;
	let readingLengthVariation;
	let readingRepetition;
	let readingTimeSort;
	// We know from the validation stage of the pipeline that the 'cumulative' and 'cumulativeReset' fields
	// will have one of the follow values undefined, 'true', or 'false'. If undefined, this means that 
	// the uploader wants the pipeline to use the database's (i.e. the meter's) default value.
	// TODO: We made the assumption that in the DB, the cumulative and cumulativeReset columns is either true or false.
	// On further inspection, these values can be null. At the moment, we are not sure what this means for the pipeline.
	// As a quick fix, we will assume that null, means false.
	// TODO At the current time this will not use the DB value if you use the web form because it is a checkbox that makes
	// it true and is false by default. Need another mechanism to get this to work.
	if (cumulative === undefined) {
		if (meter.cumulative === null) {
			areReadingsCumulative = false;
		} else {
			areReadingsCumulative = meter.cumulative;
		}
	} else {
		areReadingsCumulative = (cumulative === 'true');
	}
	if (cumulativeReset === undefined) {
		if (meter.cumulativeReset === null) {
			doReadingsReset = false;
		} else {
			doReadingsReset = meter.cumulativeReset;
		}
	} else {
		doReadingsReset = (cumulativeReset === 'true');
	}

	// If the cumulative reset times or length parameters are not set, they will be and empty string if coming from the
	// web page and undefined if coming from a curl request. Thus, both conditions are tested.
	// If not provided then the DB value is used unless missing then the default value.
	if (cumulativeResetStart === undefined || cumulativeResetStart === '') {
		if (meter.cumulativeResetStart === null) {
			// This probably should not happen with a new DB but keep just in case.
			readingResetStart = '0:00:00';
		} else {
			readingResetStart = meter.cumulativeResetStart;
		}
	} else {
		readingResetStart = cumulativeResetStart;
	}
	if (cumulativeResetEnd === undefined || cumulativeResetEnd === '') {
		if (meter.cumulativeResetEnd === null) {
			// This probably should not happen with a new DB but keep just in case.
			readingResetEnd = '23:59:59.999999';
		} else {
			readingResetEnd = meter.cumulativeResetEnd;
		}
	} else {
		readingResetEnd = cumulativeResetEnd;
	}
	if (lengthGap === undefined || lengthGap === '') {
		if (meter.readingGap === null) {
			// This probably should not happen with a new DB but keep just in case.
			// No variation allowed.
			readingGap = 0;
		} else {
			readingGap = meter.readingGap;
		}
	} else {
		// Convert string that is a real number to a value.
		// Note the variable changes from string to real number.
		readingGap = parseFloat(lengthGap);
	}
	if (lengthVariation === undefined || lengthVariation === '') {
		if (meter.readingVariation === null) {
			// This probably should not happen with a new DB but keep just in case.
			// No variation allowed.
			readingLengthVariation = 0;
		} else {
			readingLengthVariation = meter.readingVariation;
		}
	} else {
		// Convert string that is a real number to a value.
		// Note the variable changes from string to real number.
		readingLengthVariation = parseFloat(lengthVariation);
	}
	if (duplications === undefined || duplications === '') {
		if (meter.readingVariation === null) {
			// This probably should not happen with a new DB but keep just in case.
			// No variation allowed.
			readingRepetition = 1;
		} else {
			readingRepetition = meter.readingDuplication;
		}
	} else {
		// Convert string that is a real number to a value.
		// Note the variable changes from string to real number.
		readingRepetition = parseInt(duplications, 10);
	}
	if (timeSort === undefined || timeSort === TimeSortTypesJS.meter) {
		if (meter.timeSort === null) {
			// This probably should not happen with a new DB but keep just in case.
			// No variation allowed.
			readingTimeSort = TimeSortTypesJS.increasing;
			// readingTimeSort = 'increasing';
		} else {
			readingTimeSort = TimeSortTypesJS[meter.timeSort];
		}
	} else {
		readingTimeSort = timeSort;
	}

	const mapRowToModel = row => { return row; }; // STUB function to satisfy the parameter of loadCsvInput.
	await loadCsvInput(
		filepath,
		meter.id,
		mapRowToModel,
		false,
		areReadingsCumulative,
		doReadingsReset,
		readingResetStart,
		readingResetEnd,
		readingGap,
		readingLengthVariation,
		readingRepetition,
		readingTimeSort,
		hasHeaderRow,
		undefined,
		conn
	); // load csv data
	// TODO: If unsuccessful upload then an error will be thrown. We need to catch this error.
	//fs.unlink(filepath).catch(err => log.error(`Failed to remove the file ${filepath}.`, err));
	success(req, res, 'It looks like success.'); // TODO: We need a try catch for all these awaits.
	return;
}

module.exports = uploadReadings;