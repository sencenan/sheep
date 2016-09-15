'use strict';

const
	AWS = require('aws-sdk'),

	pathUtil = require('./lib/utils/path-util'),
	getPipeline = require('./lib/view/get-pipeline');

exports.handle = function(event, context, callback) {

	const
		s3 = new AWS.S3(),
		lambda = new AWS.Lambda({apiVersion: '2015-03-31'}),
		snsEvent = JSON.parse(event.Records[0].Sns.Message);

	getPipeline(
			AWS,
			{ stackName: process.env.STACK_NAME },
			snsEvent.pipeline
		)
		.then((pipeline) => {
			let stageName, stage;

			if (snsEvent.prevStage) {
				for (let i = 0; i < pipeline.stageOrder.length; ++i) {
					if (pipeline.stageOrder[i] === snsEvent.prevStage) {

						if (i === pipeline.length - 1) {
							// no more stages
							return callback(null, {});
						} else {
							stageName = pipeline.stageOrder[i + 1];
							break;
						}
					}
				}
			} else {
				stageName = pipeline.stageOrder[0];
			}

			stage = pipeline.stages[stageName];

			if (!stage) {
				return callback(new Error('unknown stage: ' + stageName));
			}

			const lambdaEvent = JSON.stringify(Object.assign(
				snsEvent,
				{
					stage: stage
				}
			));

			// store the stage config used to ran this task
			s3.putObject(
				{
					Bucket: process.env.S3_ROOT,
					Key: [
						pathUtil.getStageRoot(
							snsEvent.repo,
							snsEvent.pipeline,
							stageName,
							snsEvent.commit,
							snsEvent.timestamp
						),
						'config'
					].join('/'),
					Body: lambdaEvent,
					ContentType: 'application/json'
				},
				(err, data) => {
					// call executor lambda synchronously
					let lambda = new AWS.Lambda();

					lambda.invoke(
						{
							FunctionName: 'sheepcd_' + stage.executor,
							Payload: lambdaEvent
						},
						(err, data) => callback
					);
				}
			);
		})
		.catch((ex) => {
			callback(ex);
		});

};
