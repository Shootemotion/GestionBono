
import http from 'http';

const data = JSON.stringify({
    email: 'brunocleri@diagnos.com',
    password: '755da21d'
});

const options = {
    hostname: 'localhost',
    port: 5007,
    path: '/api/auth/bootstrap-superadmin',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
        console.log(`BODY: ${chunk}`);
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();
