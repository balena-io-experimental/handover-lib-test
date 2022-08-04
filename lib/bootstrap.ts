import { getLogger, LogContext } from '@balena/jellyfish-logger';
import { setTimeout } from 'timers/promises';
import http from 'http';

const logger = getLogger(__filename);

export const bootstrap = async (logContext: LogContext, options: any) => {
	logger.info(logContext, 'Bootstrapping', options);

	const server = http.createServer((_, res) => {
		res.end();
	});
	server.on('clientError', (_, socket) => {
		socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
	});
	server.listen(80);

	await setTimeout(Math.random() * 10000);
	logger.info(logContext, 'Started', options);

	return {
		close: async () => {
			await server.close();
			await setTimeout(2000);
		},
	};
};
