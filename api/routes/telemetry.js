const express = require('express');
const router = express.Router();
const db = require('./../dbConfig');


const getCurrentDateTimeLocal = () => {
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');

    const year = now.getFullYear();
    const month = pad(now.getMonth() + 1); // Months are zero-based
    const day = pad(now.getDate());
    const hours = pad(now.getHours());
    const minutes = pad(now.getMinutes());
    const seconds = pad(now.getSeconds());

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};


//AFSK 
// Convert binary to ASCII
function binaryToASCII(binary) {
    const chunks = binary.match(/.{1,8}/g); // Split into 8-bit chunks
    return chunks.map(chunk => String.fromCharCode(parseInt(chunk, 2))).join(""); //8bit chunck converted into character
}



//accepts AFSK audio data - coverts to ASCII - stores in database - sneds response back to client
router.post('/afsk/audio', express.json(), async (req, res) => { //express.json - parses incoming JSOn request body intot javascript obj
    try {
        //receive binary afsk data
        console.log("Received AFSK data:", req.body); //logs request body debgu
        const { decodedUart, binaryData, plotPath, goertzelPlotPath, timestamp } = req.body; //extract binary data, plotpath, and timestamp from request body
        console.log("Raw received timestamp:", timestamp); //prints out raw timestamp for debugging

        //no binary data 
        if (!binaryData) {//checks if null/missing
            console.error("No binary data received");
            return res.status(400).json({ message: "Binary data is required." });
        }

        // Convert binary to ASCII
        const asciiText = binaryToASCII(binaryData);
        console.log("Converted ASCII:", asciiText);//logs ascitext
        
        //onst routerTimestamp = new Date().toISOString();//generates timestamp in iso format
        const routerTimestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
        console.log("Timestamp:", routerTimestamp);  //log for debugging
        const currentDateTime = getCurrentDateTimeLocal();


        // Create a new telemetry entry and store in database
        console.log("Inserting data:", { plotPath, goertzelPlotPath });
        await db('telemetry').insert({
            message: decodedUart,///asccii text
            binary_data: binaryData,//binary data
            plot_path: plotPath,//file path for plot
            goertzelPlotPath: goertzelPlotPath,
            created_at: routerTimestamp//current server timestamp

        });
        console.log("Request Body:", req.body);

        if (/^V\d+(\.\d+)?$/.test(asciiText)) {
            const voltageValue = parseFloat(asciiText.slice(1)); // remove "V" and convert to float
        
            await db('voltages').insert({
                message: asciiText,
                volt: voltageValue,
                created_at: timestamp 
            });
        }

        //success status
        res.status(200).json({ 
            success: true,
            message: "Data stored successfully",
            ascii: asciiText,
            plotPath: plotPath,
            goertzelPlotPath: goertzelPlotPath
        });
    } catch (err) { //error
        console.error("Error processing AFSK data:", err);
        res.status(500).json({ 
            success: false, 
            message: "Error processing AFSK data",
            error: err.message
        });
    }
});



router.get('/telemetry', async (req, res) => {
    const { start, end } = req.query;

    try {
        let query = db('telemetry')
            .select('message', 'binary_data','plot_path', 'goertzelPlotPath ', 'created_at')
            .orderBy('created_at', 'desc');

        if (start) query = query.where('created_at', '>=', start);
        if (end) query = query.where('created_at', '<=', end);

        const telemetryData = await query;
        //console.log("Fetched telemetry data:", telemetryData);
        res.json(telemetryData);
    } catch (err) {
        console.error("Error fetching telemetry:", err);
        res.status(500).json({ 
            message: "Error fetching telemetry data.",
            error: err.message 
        });
    }
});




module.exports = router; 
