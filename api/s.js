const express = require('express'); //web framework used to create server and handle HTTP requests
const cors = require('cors'); //allows backend to be accesse dby other domains
const helmet = require('helmet'); //scure application by setting http headers
const path = require('path'); //provides utilities to work with file and directory paths

//res - used to send data from server to client in response to HTTp request
//req - enacpsulates info about incoming HTTP request from client  (POST)


// Create a single Express server instance
const server = express();

// Connect to database
const db = require('./dbConfig');

//configures static file serving - images, css, etc
server.use('/static', express.static(path.join(__dirname, '..','static')));



const corsOptions = { //cors configuration
    origin: 'http://localhost:3000', //host
    methods: 'GET, POST, PUT, DELETE, OPTIONS',
    allowedHeaders: 'Content-Type, Authorization',
    credentials: true, //cookies
};

// Middleware
server.use(cors(corsOptions)); //enable cors w specific options
server.options('*', cors(corsOptions)); //handle options requests for all routes

server.use(helmet()); //secures application w helemet middleware
//handle large incoming request bodies
server.use(express.json({ limit: '50mb' })); //configures iddleware to handle json payloads
server.use(express.urlencoded({ limit: '50mb', extended: true })); //handles url encoded data
//http headers protect from some web vulnerabilites



const { exec } = require("child_process");
const { spawn } = require('child_process');

// Simulate reading voltage from a sensor

const readVoltageFromSensor = () => {
    return Math.floor(Math.random() * 10) + 1; //number between 1 and 10
};
//used to populate power table
const readWattageFromSensor = () => {
    return Math.floor(Math.random() * 10) + 1; //number between 1 and 10 picked at random
};


// Store recording process reference
let recordingProcess = null;

//AFSK 
// Convert binary to ASCII
function binaryToASCII(binary) {
    const chunks = binary.match(/.{1,8}/g); // Split into 8-bit chunks
    return chunks.map(chunk => String.fromCharCode(parseInt(chunk, 2))).join(""); //8bit chunck converted into character
}


//endpoint returns whether recording is in progress and process id
server.get("/recording-status", (req, res) => {
    res.json({
        isRecording: !!recordingProcess, // Returns true if recording is in progress
        pid: recordingProcess?.pid  // Returns the process ID if available
    });
});

//if recording active - kill 
server.get("/reset-recording", (req, res) => { //terminates ongoing recording process if one exists
    if (recordingProcess) {
        try {
            recordingProcess.kill('SIGTERM'); // Stop the process
        } catch (err) {
            console.error("Error killing process:", err);
        }
        recordingProcess = null; // Clear the reference
    }
    res.json({ success: true, message: "Recording state reset" });
});

///run python script 

const runPythonScript = (scriptPath, args = []) => {
    return new Promise((resolve, reject) => {
        try {
            const absolutePath = path.resolve(scriptPath);
            console.log(`Starting Python script: ${absolutePath} with args:`, args);

            //spawn - used to create/run new 'child' process - ie python script
            //streams data as it is produced
            const process = spawn('python', [absolutePath, ...args],
                {
                    stdio: 'pipe', // Allow capturing output
                    detached: args[0] === 'start', // Detach process if it's 'start'
                    shell: true
                }
            ); //construct absolute file path to script
            //spawns python process to run python script
            let stdoutData = '';
            let stderrData = '';
             
            //handle output

            //listens to output and returns result to client
            //captures standard output 
            process.stdout.on('data', (data) => {
                const message = data.toString();
                stdoutData += message;
                console.log('Python output:', message);
            });


            //captrures error output
            process.stderr.on('data', (data) => {
                const message = data.toString();
                stderrData += message;
                console.error('Python error:', message);
            });

            //script starts recording - does not wait for finish to give output
            if (args[0] === 'start') {
                recordingProcess = process;
                console.log(`Stored recording process with PID: ${process.pid}`); //debug
                // For start command, resolve immediately since the process needs to keep running
                resolve({ success: true, output: "Recording started"});
            } else {
                //for other commands it waits to for process to finish and then gives output
                process.on('close', (code) => {
                    console.log(`Python script exited with code ${code}`);
                    if (code === 0 || code === null) {
                        resolve({ success: true, output: stdoutData });
                    } else {
                        reject(new Error(`Process exited with code ${code}\n${stderrData}`));
                    }
                });
            }

            process.on('error', (err) => {
                console.error('Process error:', err);
                reject(err);
            });

        } catch (err) {
            console.error('Error spawning process:', err);
            reject(err);
        }
    });
};

//use async bc cal asynchronous function - runPythonScript
//starts recording process w python script
server.get("/start-recording", async (req, res) => {
    try {
        // check if thre is a lraedy a recording happening
        if (recordingProcess) {
            try {
                // Check if process is actually running
                process.kill(recordingProcess.pid, 0); // does not terminate process but checks if it exits
                return res.status(400).json({ // bad req - recording already in progress
                    success: false,
                    error: "Recording is already in progress."
                });
            } catch (e) {
                // Process doesn't exist, clean up the reference
                console.log("Cleaning up stale recording process reference");
                recordingProcess = null;
            }
        }

        //start python script
        //_dirname - directory where node.js script running
        const scriptPath = path.join(__dirname, "try11.py");
        //wait for scirpt to start before contiuing
        const result = await runPythonScript(scriptPath, ['start']); // send start to python

            //if reording process still null - then it failed to start
        if (!recordingProcess) {
            throw new Error("Failed to start recording process");
        }

        console.log(`Recording process started with PID: ${recordingProcess.pid}`);

        res.json({ 
            success: true, //successful recording start
            message: "Recording started", 
            output: result.output,//output from python script
            pid: recordingProcess.pid
        });
    } catch (error) {
        console.error("Error starting recording:", error);
        // Clean up if something went wrong
        //if error occurred after recording started - terminate process
        if (recordingProcess) {
            try {
                //SIGTERM - signal termination - terminates process- allows for cleanup (like saving data and closing files)
                recordingProcess.kill('SIGTERM');
            } catch (e) {
                console.error("Error cleaning up process:", e);
            }
            recordingProcess = null;
        }
        res.status(500).json({ success: false, error: error.message });
    }
});

//stop recording process by sending SIGTERM signal to rynning python script
server.get("/stop-recording", async (req, res) => {
    try {
        //checks if recording is running else error
        if (!recordingProcess) {
            return res.status(400).json({ 
                success: false, 
                error: "No recording in progress" 
            });
        }

        console.log("Stopping recording process:", recordingProcess.pid);
        
        // Send SIGTERM to the process
        recordingProcess.kill('SIGTERM');
       // process.kill(-recordingProcess.pid, 'SIGTERM');
        // Wait for the process to handle the signal
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const scriptPath = path.join(__dirname, "try11.py");
        const result = await runPythonScript(scriptPath, ['stop']); //run stop command to pyton script
        
        // Clear the recording process reference
        recordingProcess = null;
        
        res.json({ 
            success: true, 
            message: "Recording stopped and processed",
            output: result.output
        });
    } catch (error) {
        console.error("Error stopping recording:", error);
        if (recordingProcess) {
            try {
                recordingProcess.kill('SIGTERM');
            } catch (e) {
                console.error("Error cleaning up process:", e);
            }
            recordingProcess = null;
        }
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

//accepts AFSK audio data - coverts to ASCII - stores in database - sneds response back to client
server.post('/afsk/audio', express.json(), async (req, res) => { //express.json - parses incoming JSOn request body intot javascript obj
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
        
        const serverTimestamp = new Date().toISOString();//generates timestamp in iso format
        console.log("Server Timestamp:", serverTimestamp);  //log for debugging



        // Create a new telemetry entry and store in database
        await db('telemetry').insert({
            message: asciiText,///asccii text
            binary_data: binaryData,//binary data
            plot_path: plotPath,//file path for plot
            created_at: serverTimestamp//current server timestamp

        });


        if (/^V\d+(\.\d+)?$/.test(asciiText)) {
            const voltageValue = parseFloat(asciiText.slice(1)); // remove "V" and convert to float
            console.log("Parsed voltage from telemetry:", voltageValue);
        
            await db('voltages').insert({
                message: asciiText,
                volt: voltageValue,
                created_at: serverTimestamp 
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


//retrieve data from database - logs
// server.get('/telemetry', async (req, res) => {
//     try {
//         const telemetryData = await db('telemetry')//fetches telmetry data from telemtetyr table
//             .select('message', 'binary_data','plot_path', 'created_at')//specifies whic hcolumns to select from table
//             .orderBy('created_at', 'desc');//orders data by timestamp in descending order

//         res.json(telemetryData); //sends retrieved data back to clinet in json response
//     } catch (err) {//error handling
//         console.error("Error fetching telemetry:", err);
//         res.status(500).json({ 
//             message: "Error fetching telemetry data.",
//             error: err.message 
//         });
//     }
// });


server.get('/telemetry', async (req, res) => {
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






// Get current date and time
const getCurrentDateTime = () => {
    return new Date().toISOString(); 
};




const session = require('express-session');
const { stdout } = require('process');
const cookieParser = require('cookie-parser');//for cookiees

const ONE_HOUR = 60 * 60 * 1000;

server.use(cookieParser());//use it bro


// Endpoints




///testt
server.get('/', (req, res) => {
    res.send('Welcome! :p');
});

let lastVoltageAddedTime = null;


// Fetch all voltage data with current date and time
//retrieve voltage data
server.get('/voltages', async (req, res) => {
    try {
        // Fetch voltage data - querires database for records in voltages table
        const voltageData = await db('voltages');
        const response = { //construct reponse 
            currentDateTime: getCurrentDateTime(), //add current timestamp
            voltageData: voltageData.map(record => ({
                id: record.id, //id
                message: record.message, //addiitional message - dont rlly need
                volt: record.volt, //volt value
                created_at: record.created_at //timestamp
            }))
        };

        res.json(response); //send response JSOn back to client
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error fetching voltage data" });
    }
});

//store voltage data
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
        if (currentVoltage.length === 0) {//if nothing - error
            return res.status(404).json({ message: "Voltage data not found" });
        }
        const response = {//response - time + currentvoltage
            currentDateTime: getCurrentDateTime(), 
            currentVoltage
        };
        res.status(200).json(response);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error fetching voltage data" });
    }
});

//GEt endpoing that reutnrs information about the structure of database table voltages - debugging
server.get('/table-info', async (req, res) => {
    try {
        //await db.raw... - executes raw SQL query - retrieves schema information for voltage dable
        const tableInfo = await db.raw('PRAGMA table_info(voltages);');
        res.json(tableInfo); //sends table information as json response to client
    } catch (err) {//if error
        console.error(err);
        res.status(500).json({ message: 'Error retrieving table info' });
    }
});


// Fetch other data with current date and time
server.get('/data', async (req, res) => {
    try {
        const data = await db('data'); //fetches all records from data table in database
        const response = { //constructs obj containting date and time and data retrieved from table
            currentDateTime: getCurrentDateTime(), //gets current timestamp
            data
        };
        res.json(response);//json obj
    } catch (err) {//error catching
        console.error(err);
        res.status(500).json({ message: "Error fetching data" });
    }
});

//retrieve power readings
server.get('/power', async (req, res) => {
    try {
        //fetches all records from power table
        const powerData = await db('power');
        const response = {//construct response to send back
            currentDateTime: getCurrentDateTime(),//date and time
            powerData: powerData.map(record => ({//maps each record and extracts these fields
                id: record.id,
                message: record.message,
                watt: record.watt,
                created_at: record.created_at
            }))
        };
        res.json(response);//json obj sent to client
    } catch (err) {//catch errros
        console.error(err);
        res.status(500).json({ message: "Error fetching power data" });
    }
});

//adds new power data to databse
server.post('/add-power', async (req, res) => {
    try {
        //calls function to create new data 
        const newWattage = readWattageFromSensor();
        console.log(`New power reading: ${newWattage}`);//logs it to debug

        // Insert the new wattage reading into the database
        await db('power').insert({
            message: 'New power reading',
            watt: newWattage
        });

        //success message if successful
        res.status(200).json({ message: "New power added", wattage: newWattage });
    } catch (err) {//else error
        console.error(err);
        res.status(500).json({ message: "Error adding power data" });
    }
});

//GEt endpoint where id is used as dynamic route parameter
server.get('/power/:id', async (req, res) => {
    const { id } = req.params;//destructures id parameter froom requests url
    try {
        //queries power table for record that matches provided id
        const currentPower = await db('power').where({ id });
        if (currentPower.length === 0) {//if no records found - message
            return res.status(404).json({ message: "Power data not found" });
        }
        const response = {//create response if id found
            currentDateTime: getCurrentDateTime(),
            currentPower
        };
        res.status(200).json(response);//success
    } catch (err) {//error handle
        console.error(err);
        res.status(500).json({ message: "Error fetching power data" });
    }
});

//returns schema information for power table
server.get('/power-table-info', async (req, res) => {
    try {
        //raw sql query to retireve structure of power tbale - column names, tpes
        const tableInfo = await db.raw('PRAGMA table_info(power);');
        res.json(tableInfo);//sends retrieved table schema info as json response
    } catch (err) {
        console.error(err);//error handle
        res.status(500).json({ message: 'Error retrieving power table info' });
    }
});
//log posts
//authenticate callsign
server.post('/authenticate-callsign', async (req, res) => {
    //res.header - adds HTTP headers to response
    ///acces-control-allow-origin - specifies that requests can come from
    //htpp://... - allows cross origin request from this domain
    res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
    res.header('Access-Control-Allow-Credentials', 'true'); //allows cookies to be sent with requests from the client
    const { callsign } = req.body;//destructures callsin from request body

    //res.json({ message: 'Endpoint working!', callsign: req.body.callsign });

    if (!callsign || typeof callsign !== "string") {//checks if callsign is missing or not a string
        console.log("Invalid callsign:", callsign); //log error if invalid - debug
        return res.status(400).json({ success: false, message: "Invalid callsign format" }); //response back to client if invalid
    }

    //external api url w callsign information
    const url = `https://callook.info/${callsign}/json`;

    //API check for valid callsign 
    try {
        console.log("Fetching from URL:", url); //log url being fetched
        const response = await fetch(url); //make request to external api
       // console.log("Raw response:", response);
        const data = await response.json(); //conver api response to json format
        //console.log("Parsed JSON data:", data);

        if (!response.ok) { //handle errors - checks if response isnt cool
            console.error(`API error: ${response.status} ${response.statusText}`); //log the error status and message
            //send error response w status and message frome xternal api
            return res.status(response.status).json({ success: false, message: `Callook API error: ${response.statusText}` });
        }

        if (data.status !== "VALID") {//check if callsign is valid according to external api
            console.log("Invalid callsign status:", data.status);//log if callsign is invalid
            //send 404 response if callsign not found
            return res.status(404).json({ success: false, message: "Callsign not found in Callook" });
        }

        const callsignData = data.current; //extract callsign data from api response
        console.log("Valid Callsign:", callsignData.callsign); //logs valid calsign for debugging

        //create session ID by combining callsign and timestamp
        const sessionId = `${callsign}-${Date.now()}`;
        res.cookie("session", sessionId, { //sett session cookie w session id
            httpOnly: true,  //ensure cookie is not accessible from javascript
            secure: false, //not using https
            sameSite: "lax",//restrict cookie to be sent w same site requests
            maxAge: 60 * 60 * 1000, //1 hour
        })


        //sends good response if success 
        return res.json({
            success: true,
            message: "Valid callsign",
            data: callsignData
        });

    } catch (error) {//error handle
        console.error("Error during fetch or processing:", error.name, error.message);
        console.error("Error stack:", error.stack);
        res.status(500).json({ message: `Error during authentication: ${error.message}` });
    }
});


//fetch all log records from database
server.get('/logs', async(req, res) => {
    try{
        const logs = await db('logs').select("*"); //queries logs table in database and selects all columns
        res.json(logs);//send retrieved log records back to clinet as json 
    } catch (error) {//if error - catch 
        console.error("Error fetching logs:", error);//log error
        res.status(500).json({message: "Error fetching logs"});
    }
});

//verifies sessioni based on cookies and checks if still valid
server.get('/verify-session', (req, res) => {
    const sessionId = req.cookies.session; //retrieves session cookie from request
    
    if (!sessionId) {//if no session cookie found - send false 
        return res.json({ success: false, message: "No session found" });
    }
    

      // Parse the sessionId to get callsign and timestamp
      const [callsign, timestamp] = sessionId.split('-');
    
      // Calculate session age by subtract timestamp from current time
      const sessionAge = Date.now() - parseInt(timestamp);
    
    // Check if session is older than one hour
    //if session is older than 1 hr - expired
    if (sessionAge > ONE_HOUR) {  
        return res.status(401).json({ 
            success: false, 
            message: "Session expired",
            redirectToLogin: true
        });
    }
    
    //session valid - success messagge
    res.json({ 
        success: true, 
        message: "Session valid",
        callsign: callsign
    });
});

//logs out user and clears cookies
server.post('/logout', (req, res) => {
    res.clearCookie('session', {//clears session cookie
        httpOnly: true, 
        secure: false, // set to true if using https
        sameSite: "lax"
    });
    //succss message
    res.json({ success: true, message: "Logged out successfully" });
});


//post endpoint - add log
server.post('/add-log', async (req, res) => {

    const sessionId = req.cookies.session; //extracts session cookie from request
    if (!sessionId) { //if no sessioni found - error
        return res.status(403).json({ message: "No active session. Please log in." });
    }
    
    const callsign = sessionId.split('-')[0]; //extracts callsign from session id which is strucutred callsign-timestamp
    const { telemetry_data } = req.body; //gets telemetry data from reques bodyy
    const currentDateTime = getCurrentDateTime(); //gets current timestamp
    console.log("Received data on /add-log:", { callsign, telemetry_data }); //logs received callsign and telemetry data - debug

    console.log("Received body:", req.body) //logs entire request body

    if(!callsign || callsign === "Guest"){//checks if callsign is missing or guest
        //if true - prevent action - sends response guest cant log entries
        return res.status(403).json({message: "Guest users are not allowed to add logs"});
    }

    console.log("Incoming callsign:", callsign);//logs callsign to verify valid callsign being used

    try {
        //insert new record into log table - stores callsign, telemetry data, and time stamp
        await db('logs').insert({ callsign, telemetry_data, created_at: currentDateTime });
        //success message
        res.json({ success: true, message: "Log added successfully" });
    } catch (error) {//error handling
        console.error("Error adding log:", error);
        res.status(500).json({ message: "Error adding log" });
    }
});

server.get('/add-logs', async (req, res) => { //get endpoint that retreives stored log records
    try {
        const logs = await db('logs').select("*"); //queries logs table and retrieves all records
        res.json(logs); //send log data as json 
    } catch (error) { //error handling
        console.error("Error fetching logs:", error);
        res.status(500).json({ message: "Error fetching logs" });
    }






});





//creates map obj that stores status of recording 
//used to store key value pairs where key is current and value is an obj representing status of current recroding
const recordingStatuses = new Map();

//defines post endpoint which accepts json data and updates status of recording
//express.json - middlware parses incoming request bodies that are json format
server.post('/recording-status', express.json(), async (req, res) => {
    try {
        const { status, timestamp, error } = req.body; //extractss status, timestamp, and error
        

        console.log(`Received Status: ${status}`); // Debugging log
        // Store in database
        await db('telemetry').insert({ //insert new record into telemetry table of database
            message: `Recording ${status}${error ? ': ' + error : ''}`,//recording recording 
            created_at: timestamp//timestamp
        });

         // Check if the status contains a voltage reading
        const voltageMatch = status.match(/(\d+)\s*volts/i); // Extracts volts
        if (voltageMatch) {
            const voltageValue = parseFloat(voltageMatch[1]); // Extract voltage number
            console.log(`Extracted Voltage: ${voltageValue}V`);
                 // Insert into voltages table
                 await db('voltages').insert({
                    message: 'Telemetry voltage reading',
                    volt: voltageValue,
                    created_at: timestamp
                });
            }
        
        //updates recordingstatuses map w latest status info under key current
        //map will hold latest status of recording process
        recordingStatuses.set('current', { status, timestamp, error });
        res.json({ success: true });//send json response back to client - success
    } catch (err) {///error handling
        console.error('Error updating recording status:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

//define get endpoint - retrieve current recording status
server.get('/recording-status', (req, res) => {
    //recording.statuses.get(current) - retrieves current recording status from the map
    //if no stat is set - default to idle 
    const status = recordingStatuses.get('current') || { status: 'idle' };
    res.json(status);//send current status back to client
});

// Update the status endpoint
server.get("/status", (req, res) => {
    //retrieve current recording status from the map
    const currentStatus = recordingStatuses.get('current');
    res.json({//json response
        recording: !!recordingProcess && currentStatus?.status === 'recording',//returns true if active recoridng else false
        status: currentStatus?.status || 'idle', //returns current sttus -default idle
        pid: recordingProcess?.pid, //if recording in proress returns process id (pid)
        lastUpdate: currentStatus?.timestamp//returns timestamp
    });
});




module.exports = server;
