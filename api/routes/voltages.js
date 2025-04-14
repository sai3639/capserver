const express = require('express');
const router = express.Router();
const db = require('./../dbConfig');

const readVoltageFromSensor = () => {
    return Math.floor(Math.random() * 10) + 1; //number between 1 and 10
};
//used to populate power table
const readWattageFromSensor = () => {
    return Math.floor(Math.random() * 10) + 1; //number between 1 and 10 picked at random
};



// Get current date and time
const getCurrentDateTime = () => {
    return new Date().toISOString(); 
};


// Fetch all voltage data with current date and time
//retrieve voltage data
router.get('/voltages', async (req, res) => {
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
        res.status(500).json({ message: "Err getting volt data" });
    }
});

//store voltage data
router.post('/add-voltage', async (req, res) => {
    try {
        const newVoltage = readVoltageFromSensor();

        // Insert the new voltage reading into the database
        await db('voltages').insert({
            message: 'New sensor reading',
            volt: newVoltage
        });

        // Send the response to the client
        res.status(200).json({ message: "Voltage added", voltage: newVoltage });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error adding" });
    }
});

// Fetch voltage data by ID with current date and time
router.get('/voltages/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const currentVoltage = await db('voltages').where({ id });
        if (currentVoltage.length === 0) {//if nothing - error
            return res.status(404).json({ message: "data not found" });
        }
        const response = {//response - time + currentvoltage
            currentDateTime: getCurrentDateTime(), 
            currentVoltage
        };
        res.status(200).json(response);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Err getting dta" });
    }
});

//GEt endpoing that reutnrs information about the structure of database table voltages - debugging
router.get('/table-info', async (req, res) => {
    try {
        //await db.raw... - executes raw SQL query - retrieves schema information for voltage dable
        const tableInfo = await db.raw('PRAGMA table_info(voltages);');
        res.json(tableInfo); //sends table information as json response to client
    } catch (err) {//if error
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

module.exports = router;
