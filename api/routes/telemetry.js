const express = require('express');
const router = express.Router();
const db = require('./../dbConfig');





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
        const { binaryData, plotPath, timestamp } = req.body; //extract binary data, plotpath, and timestamp from request body
        console.log("Raw received timestamp:", timestamp); //prints out raw timestamp for debugging

        //no binary data 
        if (!binaryData) {//checks if null/missing
            console.error("No binary data received");
            return res.status(400).json({ message: "Binary data is required." });
        }

        // Convert binary to ASCII
        const asciiText = binaryToASCII(binaryData);
        console.log("Converted ASCII:", asciiText);//logs ascitext
        
        const routerTimestamp = new Date().toISOString();//generates timestamp in iso format
        console.log("Timestamp:", routerTimestamp);  //log for debugging



        // Create a new telemetry entry and store in database
        await db('telemetry').insert({
            message: asciiText,///asccii text
            binary_data: binaryData,//binary data
            plot_path: plotPath,//file path for plot
            created_at: routerTimestamp//current server timestamp

        });


        if (/^V\d+(\.\d+)?$/.test(asciiText)) {
            const voltageValue = parseFloat(asciiText.slice(1)); // remove "V" and convert to float
        
            await db('voltages').insert({
                message: asciiText,
                volt: voltageValue,
                created_at: routerTimestamp 
            });
        }

        //success status
        res.status(200).json({ 
            success: true,
            message: "Data stored successfully",
            ascii: asciiText,
            plotPath: plotPath
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
            .select('message', 'binary_data','plot_path', 'created_at')
            .orderBy('created_at', 'desc');

        if (start) query = query.where('created_at', '>=', start);
        if (end) query = query.where('created_at', '<=', end);

        const telemetryData = await query;
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
