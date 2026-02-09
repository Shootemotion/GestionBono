// Native fetch in Node 18+

const run = async () => {
    try {
        const response = await fetch('http://localhost:5007/api/system/run', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log(`Status: ${response.status} ${response.statusText}`);

        const text = await response.text();
        console.log("Raw response body:", text);

        try {
            const json = JSON.parse(text);
            console.log("JSON:", json);
        } catch (e) {
            console.log("Not JSON");
        }

    } catch (error) {
        console.error("Fetch failed:", error);
    }
};

run();
