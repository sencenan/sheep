'use strict';

const
	path = require('path'),
	fs = require('fs'),
	s3Util = require('../utils/s3-util'),
	pathUtil = require('../utils/path-util'),
	setupExecDir = require('../executor/setup-execution-directory');

/*
 * @param {Object} BuildDetails
 *
 * @param {String} repo
 * @param {String} pipeline
 * @param {String} stage
 * @param {String} versionIdentifier
 */

module.exports = function(AWS, context, params) {
	const
		stageRoot = pathUtil.getStageRoot(
			params.repo, params.pipeline, params.stage
		),
		s3StageRoot = path.join(stageRoot, params.versionIdentifier);

	let dirs;

	return new Promise((resolve, reject) => {
		try {
			dirs = setupExecDir(params.repo, params.versionIdentifier, false);
		} catch(ex) {
			reject(ex);
		}

		resolve(dirs);
	})
		.then(() => s3Util.downloadDir(
			AWS,
			{
				localDir: dirs.cwd,
				s3Params: {
					Bucket: context.s3Root,
					Prefix: s3StageRoot
				}
			}
		))
		.then(() => s3Util.downloadFile(
			AWS,
			{
				localFile: dirs.cwd + '/config',
				s3Params: {
					Bucket: context.s3Root,
					Key: s3StageRoot + '/config'
				}
			}
		))
		.then(() => {
			const
				result = JSON.parse(
					fs.readFileSync(dirs.cwd + '/reports/result.json')
				),
				config = JSON.parse(
					fs.readFileSync(dirs.cwd + '/config')
				);

			result.tasks = result.tasks || [];
			result.resultCodes = result.resultCodes || [];

			return Object.assign(
				result,
				{
					repo: params.repo,
					pipeline: params.pipeline,
					stage: params.stage,
					config: config
				},
				{
					outputs: result.resultCodes.map((code, idx) => {
						return {
							task: result.tasks[idx] || 'UNKNOWN TASK NAME',
							code: code,
							output: fs.readFileSync(
								dirs.cwd + '/reports/' + idx
							).toString()
						};
					})
				}
			);
		});
};
