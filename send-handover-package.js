const dgram = require('dgram');

const SHUTDOWN_PORT = 6666;
const SHUTDOWN_BROADCAST_ADDRESS = "239.255.255.250";

const serverSocker = dgram.createSocket('udp4');

const timestamp = new Date().valueOf();

const message = Buffer.alloc(9);
message[0] = 0;
message.writeBigInt64BE(BigInt(timestamp), 1);
serverSocker.send(message, SHUTDOWN_PORT, SHUTDOWN_BROADCAST_ADDRESS, (err, bytes) => {
  if ( err ) {
    console.error("Error when sending packet", err);
  } else {
    console.info(`heartbeat sent ( ${bytes} bytes)`);
  }
});
