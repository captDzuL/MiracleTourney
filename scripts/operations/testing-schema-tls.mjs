import net from 'node:net';
import tls from 'node:tls';

const hosts = Object.freeze([
  'ep-delicate-forest-azuodo4q.c-3.ap-southeast-1.aws.neon.tech',
  'ep-delicate-forest-azuodo4q-pooler.c-3.ap-southeast-1.aws.neon.tech',
]);

function fail() { const error = new Error('TLS_REJECTED'); error.code = 'TLS_REJECTED'; return error; }

function probe(host) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port: 5432 });
    let secure;
    let settled = false;
    const deadline = setTimeout(() => finish(false), 10_000);
    function finish(ok) {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      secure?.destroy();
      socket.destroy();
      if (ok) resolve(true); else reject(fail());
    }
    socket.once('error', () => finish(false));
    socket.once('connect', () => {
      const request = Buffer.alloc(8);
      request.writeInt32BE(8, 0);
      request.writeInt32BE(80877103, 4);
      socket.write(request);
    });
    socket.once('data', bytes => {
      if (bytes.length !== 1 || bytes[0] !== 83) return finish(false);
      socket.removeAllListeners('error');
      secure = tls.connect({ socket, servername: host, rejectUnauthorized: true, minVersion: 'TLSv1.2' });
      secure.once('error', () => finish(false));
      secure.once('secureConnect', () => finish(secure.authorized));
    });
  });
}

export async function verifyTestingFrontendTls() {
  for (const host of hosts) await probe(host);
  return true;
}
