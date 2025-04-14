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



//retrieve power readings
router.get('/power', async (req, res) => {
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
        res.status(500).json({ message: "Error getting data" });
    }
});

//adds new power data to databse
router.post('/add-power', async (req, res) => {
    try {
        //calls function to create new data 
        const newWattage = readWattageFromSensor();

        // Insert the new wattage reading into the database
        await db('power').insert({
            message: 'New power reading',
            watt: newWattage
        });

        //success message if successful
        res.status(200).json({ message: " power added", wattage: newWattage });
    } catch (err) {//else error
        console.error(err);
        res.status(500).json({ message: "Error adding" });
    }
});

//GEt endpoint where id is used as dynamic route parameter
router.get('/power/:id', async (req, res) => {
    const { id } = req.params;//destructures id parameter froom requests url
    try {
        //queries power table for record that matches provided id
        const currentPower = await db('power').where({ id });
        if (currentPower.length === 0) {//if no records found - message
            return res.status(404).json({ message: "data not found" });
        }
        const response = {//create response if id found
            currentDateTime: getCurrentDateTime(),
            currentPower
        };
        res.status(200).json(response);//success
    } catch (err) {//error handle
        console.error(err);
        res.status(500).json({ message: "Error getting power data" });
    }
});

//returns schema information for power table
router.get('/power-table-info', async (req, res) => {
    try {
        //raw sql query to retireve structure of power tbale - column names, tpes
        const tableInfo = await db.raw('PRAGMA table_info(power);');
        res.json(tableInfo);//sends retrieved table schema info as json response
    } catch (err) {
        console.error(err);//error handle
        res.status(500).json({ message: 'Error' });
    }
});


module.exports = router;
