const express = require('express');
const router = express.Router();
const path = require('path');
const { spawn } = require('child_process');
const db = require('./../dbConfig');




// Store recording process reference
let recordingProcess = null;




//if recording active - kill 
router.get("/reset-recording", (req, res) => { //terminates ongoing recording process if one exists
    if (recordingProcess) {
        try {
            recordingProcess.kill('SIGTERM'); // Stop the process
        } catch (err) {
            console.error("Error killing process:", err);
        }
        recordingProcess = null; // Clear the reference
    }
    res.json({ success: true, message: "Recording reset" });
});

///run python script 

const runPythonScript = (scriptPath, args = []) => {
    return new Promise((resolve, reject) => {
        try {
            const absolutePath = path.resolve(scriptPath);
            console.log(`Running Python script: ${absolutePath}`, args);

            //spawn - used to create/run new 'child' process - ie python scrpt
            //streams data as it is produced
            const process = spawn('python', [absolutePath, ...args],
                {
                    stdio: 'pipe', // Allow capturing output
                    detached: args[0] === 'start', // Detach process if it's 'start'
                    shell: true
                }
            ); //construct absolute file path to script
            //spawns python process to run python script
            let stdout = '';
            let stderr = '';
             
            //handle output

            //listens to output and returns result to client
            //captures standard output 
            process.stdout.on('data', (data) => {
                const message = data.toString();
                stdout += message;
            });


            //captrures error output
            process.stderr.on('data', (data) => {
                const message = data.toString();
                stderr += message;
            });

            //script starts recording - does not wait for finish to give output
            if (args[0] === 'start') {
                recordingProcess = process;
                // For start command, resolve immediately since the process needs to keep running
                resolve({ success: true, output: "Recording started"});
            } else {
                //for other commands it waits to for process to finish and then gives output
                process.once('close', (code) => {
                    if (code === 0 || code === null) {
                        resolve({ success: true, output: stdoutData });
                    } else {
                        reject(new Error(`Process exited with code ${code}\n${stderrData}`));
                    }
                });
            }

            process.once('error', (err) => {
                console.error('Process error:', err);
                reject(err);
            });

        } catch (err) {
            console.error('Error:', err);
            reject(err);
        }
    });
};

//use async bc cal asynchronous function - runPythonScript
//starts recording process w python script
router.get("/start-recording", async (req, res) => {
    try {
        // check if thre is a lraedy a recording happening
        if (recordingProcess) {
            try {
                // Check if process is actually running
                process.kill(recordingProcess.pid, 0); // does not terminate process but checks if it exits
                return res.status(400).json({ // bad req - recording already in progress
                    success: false,
                    error: "Recording already going"
                });
            } catch (e) {
                // Process doesn't exist, clean up the reference
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
            throw new Error("Couldn't start");
        }


        res.json({ 
            success: true, //successful recording start
            message: "Recording started", 
            output: result.output,//output from python script
            pid: recordingProcess.pid
        });
    } catch (error) {
        console.error("Error starting ", error);
        // Clean up if something went wrong
        //if error occurred after recording started - terminate process
        if (recordingProcess) {
            try {
                //SIGTERM - signal termination - terminates process- allows for cleanup (like saving data and closing files)
                recordingProcess.kill('SIGTERM');
            } catch (e) {
                console.error("Error cleaning :", e);
            }
            recordingProcess = null;
        }
        res.status(500).json({ success: false, error: error.message });
    }
});

//stop recording process by sending SIGTERM signal to rynning python script
router.get("/stop-recording", async (req, res) => {
    try {
        //checks if recording is running else error
        if (!recordingProcess) {
            return res.status(400).json({ 
                success: false, 
                error: "No recording active" 
            });
        }

        
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
        console.error("Error stopping", error);
        if (recordingProcess) {
            try {
                recordingProcess.kill('SIGTERM');
            } catch (e) {
                console.error("Error cleaning:", e);
            }
            recordingProcess = null;
        }
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});




//creates map obj that stores status of recording 
//used to store key value pairs where key is current and value is an obj representing status of current recroding
const recordingStatuses = new Map();

//defines post endpoint which accepts json data and updates status of recording
//express.json - middlware parses incoming request bodies that are json format
router.post('/recording-status', express.json(), async (req, res) => {
    try {
        const { status, timestamp, error } = req.body; //extractss status, timestamp, and error
        

        // Store in database
        await db('telemetry').insert({ //insert new record into telemetry table of database
            message: `Recording ${status}${error ? ': ' + error : ''}`,//recording recording 
            created_at: timestamp//timestamp
        });

         // Check if the status contains a voltage reading
        const voltageMatch = status.match(/(\d+)\s*volts/i); // Extracts volts
        if (voltageMatch) {
            const voltageValue = parseFloat(voltageMatch[1]); // Extract voltage number
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
        res.status(500).json({ success: false, error: err.message });
    }
});

//define get endpoint - retrieve current recording status
router.get('/recording-status', (req, res) => {
    //recording.statuses.get(current) - retrieves current recording status from the map
    //if no stat is set - default to idle 
    const status = recordingStatuses.get('current') || { status: 'idle' };
    res.json(status);//send current status back to client
});

// Update the status endpoint
router.get("/status", (req, res) => {
    //retrieve current recording status from the map
    const currentStatus = recordingStatuses.get('current');
    res.json({//json response
        recording: !!recordingProcess && currentStatus?.status === 'recording',//returns true if active recoridng else false
        status: currentStatus?.status || 'idle', //returns current sttus -default idle
        pid: recordingProcess?.pid, //if recording in proress returns process id (pid)
        lastUpdate: currentStatus?.timestamp//returns timestamp
    });
});



module.exports = router;
