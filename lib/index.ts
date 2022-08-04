import { defaultEnvironment as environment } from '@balena/jellyfish-environment';
import { getLogger } from '@balena/jellyfish-logger';
import { v4 as uuidv4 } from 'uuid';
import { bootstrap } from './bootstrap';
import cluster from 'node:cluster';
import { cpus } from 'node:os';
import process from 'node:process';
import { HandoverPeer } from './handover-peer';

// Avoid including package.json in the build output!
// tslint:disable-next-line: no-var-requires
const packageJSON = require('../package.json');

const logger = getLogger(__filename);

let numCPUs = cpus().length;

const MAX_WORKERS = process.env.MAX_WORKERS;
if (MAX_WORKERS) {
	numCPUs = Math.min(numCPUs, parseInt(MAX_WORKERS, 10));
}

const DEFAULT_CONTEXT = {
	id: `SERVER-ERROR-${process.pid}-${environment.pod.name}-${packageJSON.version}`,
};

const onError = (error, message = 'Server error', ctx = DEFAULT_CONTEXT) => {
	logger.error(ctx, message, error);
	console.error({
		context: ctx,
		message,
		error,
	});
	console.error('Process exiting');
	setTimeout(() => {
		process.exit(1);
	}, 1000);
};

process.on('unhandledRejection', (error) => {
	return onError(error, 'Unhandled Server Error');
});

const startDate = new Date();

const run = async () => {
	if (cluster.isPrimary) {
		const context = {
			id: `SERVER-PID-${process.pid}-${environment.pod.name}-${packageJSON.version}-primary`,
		};
		const handoverPeer = new HandoverPeer(startDate, context);

		logger.info(
			context,
			`Primary worker started, spawning ${numCPUs} workers`,
			{
				time: startDate.getTime(),
			},
		);

		// Fork workers.
		for (let i = 0; i < numCPUs; i++) {
			cluster.fork();
		}
		cluster.on('exit', (worker, code, signal) => {
			if (worker.exitedAfterDisconnect === true) {
				logger.info(
					context,
					`PID: ${process.pid}. worker ${worker?.process?.pid} exited (${
						signal || code
					}).`,
				);
			} else {
				logger.info(
					context,
					`PID: ${process.pid}. worker ${worker?.process?.pid} died (${
						signal || code
					}). Forking again`,
				);
				cluster.fork();
			}
		});

		cluster.on('online', (worker) => {
			logger.info(
				context,
				`PID: ${process.pid}. Worker ${worker.id} responded after it was forked`,
			);
		});

		// Wait for at a worker to start
		console.info(`PID: ${process.pid}. Waiting for workers to start`);

		cluster.on('message', (worker, message) => {
			if (message?.msg === 'worker-started') {
				logger.info(
					context,
					`PID: ${process.pid}. Worker ${worker.id} worker-started`,
				);
				handoverPeer.startBroadcasting();
			} else if (message?.msg === 'DONE') {
				// Ignored, is handled by the shutdown code
			} else {
				console.warn(
					`PID: ${process.pid}. Unknown message received from worker`,
					message,
				);
			}
		});

		const shutdown = async () => {
			let exitedWorkers = 0;
			const activeWorkers = Object.values(cluster.workers || {});
			for (const worker of activeWorkers) {
				worker?.on('message', (message) => {
					if (message?.msg === 'DONE') {
						exitedWorkers++;
					}
				});
				worker?.send('SHUTDOWN');
			}
			const shutdownStartedAt = Date.now();
			// Wait up to 1 minute
			while (exitedWorkers < activeWorkers.length && Date.now() < shutdownStartedAt + 60000) {
				logger.info(
					context,
					`PID: ${process.pid}. Waiting for workers to exit. exitedWorkers: ${exitedWorkers} of ${activeWorkers.length}`,
				);
				await new Promise((r) => setTimeout(r, 1000));
			}
			logger.info(
				context,
				`PID: ${process.pid}. All workers exited or deadline reached. exitedWorkers: ${exitedWorkers} of ${activeWorkers.length}`,
			);
		};

		handoverPeer.startListening(shutdown);
	} else {
		const id = uuidv4();
		const context = {
			id: `SERVER-PID-${process.pid}-${environment.pod.name}-${packageJSON.version}-worker#${cluster.worker?.id}-${id}`,
		};

		logger.info(context, `Starting server with worker ${cluster.worker?.id}`, {
			time: startDate.getTime(),
		});

		try {
			const options = {
				onError,
			};

			bootstrap(context, options)
				.then((server) => {
					const endDate = new Date();
					const timeToStart = endDate.getTime() - startDate.getTime();

					logger.info(context, 'Server started', {
						time: timeToStart,
					});

					process.send!({ msg: 'worker-started' });

					cluster.worker?.on('message', async (msg) => {
						if (msg === 'SHUTDOWN') {
							await server.close();
							console.log(`${cluster.worker?.id}:Server stopped`);
							process.send!({ msg: 'DONE' });
							// bye
							setTimeout(() => cluster.worker?.kill(), 100);
						}
					});

					if (timeToStart > 10000) {
						logger.warn(context, 'Slow server startup time', {
							time: timeToStart,
						});
					}
				})
				.catch((error) => {
					logger.error(context, 'Server error', error);
					process.exit(1);
				});
		} catch (error) {
			onError(error);
		}
	}
};

run();
