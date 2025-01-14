require('dotenv').config()
const express = require('express');
const app = express();
const cors = require('cors');
const port = process.env.PORT || 5000;


// middel ware
app.use(cors());
app.use(express.json());


// default get api
app.get('/', (req, res)=>{
  res.send("All Task on Here!!")
})

app.listen(port, ()=>{
  console.log(`Task create on the port: ${port}`)
})