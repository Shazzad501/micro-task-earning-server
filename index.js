require('dotenv').config()
const express = require('express');
const app = express();
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId, Transaction } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000;


// middel ware
app.use(cors());
app.use(express.json());




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wlddb.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

    // all db collection
    const usersCollection = client.db('MultiTaskDB').collection('users')
    const paymentCollection = client.db('MultiTaskDB').collection('pyments')



    // user data posting api
    app.post('/users', async(req, res)=>{
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    })

    // get spacific user match by email
    app.get('/users/:email', async(req, res)=>{
      const email = req.params.email;
      const filter = {userEmail: email};
      const result = await usersCollection.findOne(filter)
      res.send(result);
    })


    // buyer payment related api
    app.post('/create-payment-intent', async(req, res)=>{
      const {amount, buyerId} = req.body;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100,
        currency: 'usd',
        metadata: { buyerId },
      })
      res.send({
        clientSecret: paymentIntent.client_secret,
      })
    })

    // handle success full payment and update coins
    app.post('/payment-success', async(req, res)=>{
      const { paymentIntentId, buyerId, buyerName, buyerPhoto, buyerEmail} = req.body;

      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      if(paymentIntent.status === 'succeeded'){
        const amountPaid = paymentIntent.amount_received / 100;

        const user = await usersCollection.findOne({_id: new ObjectId(buyerId)})

        if(user){
          const newCoinBalance = user.totalCoin + amountPaid * 10;
          await usersCollection.updateOne(
            {_id: new ObjectId(buyerId)},
            { $set: { totalCoin: newCoinBalance } }
          );

          // save payment info into the payment collection
          const paymentInfo ={
            buyerId,
            buyerEmail,
            buyerPhoto,
            buyerName,
            transactionId: paymentIntentId,
            amount: amountPaid,
            coinsAdded: amountPaid * 10,
            date: new Date(),
          }
          await paymentCollection.insertOne(paymentInfo);
          res.send({ success: true, message: 'Payment successful and coins updated!' });
        }
        else {
            res.status(404).send({ success: false, message: 'User not found!' });
          }
      }
    })

    // get buyer paymet history by buyer id
    app.get('/payments/:id', async(req, res)=>{
      const id = req.params.id;
      const filter = {buyerId: id};
      const result = await paymentCollection.find(filter).toArray();
      res.send(result);
    })

    
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


// default get api
app.get('/', (req, res)=>{
  res.send("All Task on Here!!")
})

app.listen(port, ()=>{
  console.log(`Task create on the port: ${port}`)
})