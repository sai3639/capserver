const express = require('express'); //web framework used to create server and handle HTTP requests
const cors = require('cors'); //allows backend to be accesse dby other domains
const helmet = require('helmet'); //scure application by setting http headers
const path = require('path'); //provides utilities to work with file and directory paths
require('dotenv').config()
//res - used to send data from server to client in response to HTTp request
//req - enacpsulates info about incoming HTTP request from client  (POST)

const dbUrl = process.env.DATABASE_URL

// Create a single Express server instance
const server = express();

// Connect to database
const db = require('./dbConfig');

//configures static file serving - images, css, etc
server.use('/static', express.static(path.join(__dirname, '..','static')));



const corsOptions = { //cors configuration
    origin: 'https://capstoneapp-q46y.onrender.com', //host
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




const cookieParser = require('cookie-parser');//for cookiees


server.use(cookieParser()); //use the cookieParser


///testt
server.get('/', (req, res) => {
    res.send('Welcome! :p');
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



// Route imports
const recordingRoutes = require('./routes/recording');
const telemetryRoutes = require('./routes/telemetry');
const voltageRoutes = require('./routes/voltages');
const powerRoutes = require('./routes/power');
const logRoutes = require('./routes/log');


// Use routes
server.use('/api', recordingRoutes);
server.use('/api', telemetryRoutes);
server.use('/api', voltageRoutes);
server.use('/api', powerRoutes);
server.use('/api/log', logRoutes);





module.exports = server;
