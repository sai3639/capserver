const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const axios = require("axios");

const app = express(); 
const cookieParser = require("cookie-parser");


app.use(express.json())


// Connect to database
const db = require('./dbConfig');



// Simulate reading voltage from a sensor
const readVoltageFromSensor = () => {
    return Math.floor(Math.random() * 10) + 1; //number between 1 and 10
};

const readWattageFromSensor = () => {
    return Math.floor(Math.random() * 10) + 1;
};


// // Declare async function to handle initial DB insertions
// const init = async () => {
//     const newVoltage = readVoltageFromSensor();
//     await db('voltages').insert({
//         message: 'New sensor reading',
//         volt: newVoltage
//     });

//     const newWattage = readWattageFromSensor();
//     await db('power').insert({
//         message: 'New power reading',
//         watt: newWattage,
//     });
// };

// init().catch(err => {
//     console.error("Error initializing database:", err);
// });


// Declare express server
const server = express();
const fetch = require('node-fetch');

const corsOptions = {
    origin: 'http://localhost:5173', 
    credentials: true, // Allow cookies to be sent
};
server.use(cors(corsOptions));

// Security 
//server.use(cors()); 
server.use(helmet()); 
server.use(express.json()); 



// Get current date and time
const getCurrentDateTime = () => {
    return new Date().toISOString(); 
};




const session = require('express-session');

const ONE_HOUR = 60 * 60 * 1000;

server.use(cookieParser());


// Endpoints





server.get('/', (req, res) => {
    res.send('Welcome! :p');
});

let lastVoltageAddedTime = null;


// Fetch all voltage data with current date and time

server.get('/voltages', async (req, res) => {
    try {
        // Fetch voltage data
        const voltageData = await db('voltages');
        const response = {
            currentDateTime: getCurrentDateTime(),
            voltageData: voltageData.map(record => ({
                id: record.id,
                message: record.message,
                volt: record.volt,
                created_at: record.created_at
            }))
        };

        res.json(response);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error fetching voltage data" });
    }
});


server.post('/add-voltage', async (req, res) => {
    try {
        const newVoltage = readVoltageFromSensor();
        console.log(`New voltage reading: ${newVoltage}`);

        // Insert the new voltage reading into the database
        await db('voltages').insert({
            message: 'New sensor reading',
            volt: newVoltage
        });

        // Send the response to the client
        res.status(200).json({ message: "New voltage added", voltage: newVoltage });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error adding voltage data" });
    }
});

// Fetch voltage data by ID with current date and time
server.get('/voltages/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const currentVoltage = await db('voltages').where({ id });
        if (currentVoltage.length === 0) {
            return res.status(404).json({ message: "Voltage data not found" });
        }
        const response = {
            currentDateTime: getCurrentDateTime(), 
            currentVoltage
        };
        res.status(200).json(response);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error fetching voltage data" });
    }
});


server.get('/table-info', async (req, res) => {
    try {
        const tableInfo = await db.raw('PRAGMA table_info(voltages);');
        res.json(tableInfo);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error retrieving table info' });
    }
});


// Fetch other data with current date and time
server.get('/data', async (req, res) => {
    try {
        const data = await db('data');
        const response = {
            currentDateTime: getCurrentDateTime(), 
            data
        };
        res.json(response);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error fetching data" });
    }
});

server.get('/power', async (req, res) => {
    try {
        const powerData = await db('power');
        const response = {
            currentDateTime: getCurrentDateTime(),
            powerData: powerData.map(record => ({
                id: record.id,
                message: record.message,
                watt: record.watt,
                created_at: record.created_at
            }))
        };
        res.json(response);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error fetching power data" });
    }
});


server.post('/add-power', async (req, res) => {
    try {
        const newWattage = readWattageFromSensor();
        console.log(`New power reading: ${newWattage}`);

        // Insert the new wattage reading into the database
        await db('power').insert({
            message: 'New power reading',
            watt: newWattage
        });

        res.status(200).json({ message: "New power added", wattage: newWattage });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error adding power data" });
    }
});


server.get('/power/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const currentPower = await db('power').where({ id });
        if (currentPower.length === 0) {
            return res.status(404).json({ message: "Power data not found" });
        }
        const response = {
            currentDateTime: getCurrentDateTime(),
            currentPower
        };
        res.status(200).json(response);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error fetching power data" });
    }
});


server.get('/power-table-info', async (req, res) => {
    try {
        const tableInfo = await db.raw('PRAGMA table_info(power);');
        res.json(tableInfo);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error retrieving power table info' });
    }
});
//log posts
server.post('/authenticate-callsign', async (req, res) => {
    res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
    res.header('Access-Control-Allow-Credentials', 'true');
    const { callsign } = req.body;

    //res.json({ message: 'Endpoint working!', callsign: req.body.callsign });

    if (!callsign || typeof callsign !== "string") {
        console.log("Invalid callsign:", callsign);
        return res.status(400).json({ success: false, message: "Invalid callsign format" });
    }

    const url = `https://callook.info/${callsign}/json`;

    //API check for valid callsign 
    try {
        console.log("Fetching from URL:", url);
        const response = await fetch(url);
       // console.log("Raw response:", response);
        const data = await response.json();
        //console.log("Parsed JSON data:", data);

        if (!response.ok) {
            console.error(`API error: ${response.status} ${response.statusText}`);
            return res.status(response.status).json({ success: false, message: `Callook API error: ${response.statusText}` });
        }

        if (data.status !== "VALID") {
            console.log("Invalid callsign status:", data.status);
            return res.status(404).json({ success: false, message: "Callsign not found in Callook" });
        }

        const callsignData = data.current;
        console.log("Valid Callsign:", callsignData.callsign);

        const sessionId = `${callsign}-${Date.now()}`;
        res.cookie("session", sessionId, {
            httpOnly: true, 
            secure: false, //not using https
            sameSite: "lax",
            maxAge: 60 * 60 * 1000, //1 hour
        })



        return res.json({
            success: true,
            message: "Valid callsign",
            data: callsignData
        });

    } catch (error) {
        console.error("Error during fetch or processing:", error.name, error.message);
        console.error("Error stack:", error.stack);
        res.status(500).json({ message: `Error during authentication: ${error.message}` });
    }
});



server.get('/logs', async(req, res) => {
    try{
        const logs = await db('logs').select("*");
        res.json(logs);
    } catch (error) {
        console.error("Error fetching logs:", error);
        res.status(500).json({message: "Error fetching logs"});
    }
});


server.get('/verify-session', (req, res) => {
    const sessionId = req.cookies.session;
    
    if (!sessionId) {
        return res.json({ success: false, message: "No session found" });
    }
    

      // Parse the sessionId to get callsign and timestamp
      const [callsign, timestamp] = sessionId.split('-');
    
      // Calculate session age
      const sessionAge = Date.now() - parseInt(timestamp);
    
    // Check if session is older than ONE_HOUR
    if (sessionAge > ONE_HOUR) {  
        return res.status(401).json({ 
            success: false, 
            message: "Session expired",
            redirectToLogin: true
        });
    }
    
    res.json({ 
        success: true, 
        message: "Session valid",
        callsign: callsign
    });
});
server.post('/add-log', async (req, res) => {

    const sessionId = req.cookies.session;
    if (!sessionId) {
        return res.status(403).json({ message: "No active session. Please log in." });
    }
    
    const callsign = sessionId.split('-')[0];
    const { telemetry_data } = req.body;
    const currentDateTime = getCurrentDateTime();
    console.log("Received data on /add-log:", { callsign, telemetry_data });

    console.log("Received body:", req.body)

    if(!callsign || callsign === "Guest"){
        return res.status(403).json({message: "Guest users are not allowed to add logs"});
    }

    console.log("Incoming callsign:", callsign);

    try {
        await db('logs').insert({ callsign, telemetry_data, created_at: currentDateTime });
        res.json({ success: true, message: "Log added successfully" });
    } catch (error) {
        console.error("Error adding log:", error);
        res.status(500).json({ message: "Error adding log" });
    }
});

server.get('/add-logs', async (req, res) => {
    try {
        const logs = await db('logs').select("*");
        res.json(logs);
    } catch (error) {
        console.error("Error fetching logs:", error);
        res.status(500).json({ message: "Error fetching logs" });
    }






});


module.exports = server;
