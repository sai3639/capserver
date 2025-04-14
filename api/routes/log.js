const express = require('express');
const router = express.Router();

const session = require('express-session');
const { stdout } = require('process');
const cookieParser = require('cookie-parser');//for cookiees

const ONE_HOUR = 60 * 60 * 1000;
const db = require('./../dbConfig');


router.use(cookieParser());//use it bro


//log posts
//authenticate callsign
router.post('/authenticate-callsign', async (req, res) => {
    //res.header - adds HTTP headers to response
    ///acces-control-allow-origin - specifies that requests can come from
    //htpp://... - allows cross origin request from this domain
    res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
    res.header('Access-Control-Allow-Credentials', 'true'); //allows cookies to be sent with requests from the client
    const { callsign } = req.body;//destructures callsin from request body

    //res.json({ message: 'Endpoint working!', callsign: req.body.callsign });

    if (!callsign || typeof callsign !== "string") {//checks if callsign is missing or not a string
        console.log("Invalid callsign:", callsign); //log error if invalid - debug
        return res.status(400).json({ success: false, message: "Invalid callsign" }); //response back to client if invalid
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
            return res.status(404).json({ success: false, message: "Callsign not found" });
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
        console.error("Error:", error.stack);
        res.status(500).json({ message: `Error authenticating: ${error.message}` });
    }
});


//fetch all log records from database
router.get('/logs', async(req, res) => {
    try{
        const logs = await db('logs').select("*"); //queries logs table in database and selects all columns
        res.json(logs);//send retrieved log records back to clinet as json 
    } catch (error) {//if error - catch 
        console.error("Error getting logs:", error);//log error
        res.status(500).json({message: "Error getting logs"});
    }
});

//verifies sessioni based on cookies and checks if still valid
router.get('/verify-session', (req, res) => {
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
router.post('/logout', (req, res) => {
    res.clearCookie('session', {//clears session cookie
        httpOnly: true, 
        secure: false, // set to true if using https
        sameSite: "lax"
    });
    //succss message
    res.json({ success: true, message: "Logged out" });
});


//post endpoint - add log
router.post('/add-log', async (req, res) => {

    const sessionId = req.cookies.session; //extracts session cookie from request
    if (!sessionId) { //if no sessioni found - error
        return res.status(403).json({ message: "No active session." });
    }
    
    const callsign = sessionId.split('-')[0]; //extracts callsign from session id which is strucutred callsign-timestamp
    const { telemetry_data } = req.body; //gets telemetry data from reques bodyy
    const currentDateTime = getCurrentDateTime(); //gets current timestamp


    if(!callsign || callsign === "Guest"){//checks if callsign is missing or guest
        //if true - prevent action - sends response guest cant log entries
        return res.status(403).json({message: "Guest users are not allowed to add logs"});
    }


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

router.get('/add-logs', async (req, res) => { //get endpoint that retreives stored log records
    try {
        const logs = await db('logs').select("*"); //queries logs table and retrieves all records
        res.json(logs); //send log data as json 
    } catch (error) { //error handling
        console.error("Error fetching logs:", error);
        res.status(500).json({ message: "Error fetching logs" });
    }






});

module.exports = router;
