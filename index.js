const server = require('./api/server');



//define host
const HOST = 'localhost';


//define port 
const PORT = 8888;


server.listen(PORT, () => console.log(`Server running at ${HOST}:${PORT} `))