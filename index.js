require('dotenv').config()
const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken')
const { MongoClient, ServerApiVersion, ObjectId, Transaction } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000;

const corsOptions = {
  origin: "*",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"]
};

// middel ware
app.use(cors(corsOptions));
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
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");

    // all db collection
    const usersCollection = client.db('MultiTaskDB').collection('users');
    const paymentCollection = client.db('MultiTaskDB').collection('pyments');
    const tasksCollection = client.db('MultiTaskDB').collection('tasks');
    const reviewCollection = client.db('MultiTaskDB').collection('reviews');
    const submissionCollection = client.db('MultiTaskDB').collection('submission');
    const withdrawCollection = client.db('MultiTaskDB').collection('withdraw');


    // jwt token related api
    app.post('/jwt', async(req, res)=>{
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {expiresIn: '24h'});
      res.send({token})
    })


    // verify jwt token
    const verifyToken = (req, res, next)=>{
      // console.log('Inside verify token',req.headers.authorization)
      if(!req.headers.authorization){
        return res.status(401).send({message: 'Unauthorized Access'})
      }
      const token = req.headers.authorization.split(' ')[1];
      // console.log('receive toke', token)
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) =>{
        if(err){
          // console.error('JWT Verification Error:', err);
          return res.status(401).send({message: 'Unauthorized Access'})
        }
        req.decoded = decoded;
        next()
      })

    }


    // user data posting api
    app.post('/users', async(req, res)=>{
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    })

    // update user data
    app.put('/profileUpdate/:id', verifyToken, async(req, res)=>{
      const id = req.params.id;
      const {name, userPhoto} = req.body;
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { name, userPhoto} }
      );

      res.send(result);
    });

    // get all user for admin
    app.get('/users', verifyToken, async(req, res)=>{
      const result  = await usersCollection.find().toArray();
      res.send(result);
    })

    // delete user by id
    app.delete('/users/:id', verifyToken, async(req, res)=>{
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const result = await usersCollection.deleteOne(filter);
      res.send(result);
    })

    // user role update api
    app.put('/updaterole/:id', verifyToken, async(req, res)=>{
      const id = req.params.id;
      const {role} = req.body;
      const filter = {_id: new ObjectId(id)};
      const result = await usersCollection.updateOne(filter, { $set: { role } })
      res.send(result)
    })

    // get spacific user match by email
    app.get('/users/:email', async(req, res)=>{
      const email = req.params.email;
      const filter = {userEmail: email};
      const result = await usersCollection.findOne(filter)
      res.send(result);
    })

    // get all reviews api
    app.get('/reviews', async(req, res)=>{
      const result = await reviewCollection.find().toArray()
      res.send(result);
    })

    // buyer add task api
    app.post('/tasks',verifyToken, async(req, res)=>{
      const task = req.body;
      const {buyerEmail, totalPayableCoin} = task || {}
      const user = await usersCollection.findOne({userEmail: buyerEmail})
      const {totalCoin} = user || {}
      if(!user){
        res.status(404).send({ success: false, message: 'User not found!' })
      }
      if (totalCoin < totalPayableCoin) {
      return res.status(400).send({ success: false, message: 'Insufficient coins!' });
      }

      const newCoinBalance = totalCoin - totalPayableCoin;
      await usersCollection.updateOne(
        { userEmail: buyerEmail },
        { $set: { totalCoin: newCoinBalance } }
      );

      const result = await tasksCollection.insertOne(task);
      res.send(result);
    })

    // get all task for admin
    app.get('/tasks', verifyToken, async(req, res)=>{
      const result = await tasksCollection.find().toArray();
      res.send(result)
    })

    // get task match by buyer email
    app.get('/tasks/:email', verifyToken, async(req, res)=>{
      const email = req.params.email;
      const filter = {buyerEmail: email};
      const result = await tasksCollection.find(filter).sort({ completion_date: -1 }).toArray()
      res.send(result);
    })

    // update a task 
    app.patch('/tasks/:id', verifyToken, async(req, res)=>{
      const id = req.params.id;
      const updatedTask = req.body;
      const filter = {_id: new ObjectId(id)}
      const result = await tasksCollection.updateOne(filter, { $set: updatedTask });
      res.send(result);
    })

    // delete task and update  buyer coin for buyer
    app.delete('/tasks/:id', async(req, res)=>{
      const id = req.params.id;
      const {userEmail} = req.body;
      const task = await tasksCollection.findOne({_id: new ObjectId(id)})
      const {required_workers, payable_amount} = task || {}
      const returnCoin = parseInt(required_workers) * parseInt(payable_amount);

      const deleteResult = await tasksCollection.deleteOne({_id: new ObjectId(id)});

      const updateResult = await usersCollection.updateOne(
        { userEmail: userEmail },
        { $inc: { totalCoin: returnCoin } }
      );

      res.send([deleteResult, updateResult])
    })

    // delete task api for admin
    app.delete('/admindeletetask/:id', verifyToken, async(req, res)=>{
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const result = await tasksCollection.deleteOne(filter);
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
      const { paymentIntentId, buyerId, buyerName, buyerPhoto, buyerEmail, adableCoin} = req.body;

      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      if(paymentIntent.status === 'succeeded'){
        const amountPaid = paymentIntent.amount_received / 100;

        const user = await usersCollection.findOne({_id: new ObjectId(buyerId)})

        if(user){
          const newCoinBalance = user.totalCoin + adableCoin;
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
            coinsAdded: adableCoin,
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
    app.get('/payments/:id', verifyToken, async(req, res)=>{
      const id = req.params.id;
      const filter = {buyerId: id};
      const result = await paymentCollection.find(filter).sort({date: -1}).toArray();
      res.send(result);
    })


    // get all task where requierd worker > 0 for a worker
    app.get('/tasks',verifyToken, async(req, res)=>{
      const filter = { 
        $expr: { 
          $gt: [ 
            { $toInt: "$required_workers" }, // Convert string to integer
            0 
          ] 
        } 
      };
      const result = await tasksCollection.find(filter).sort({ completion_date: -1 }).toArray();
      res.send(result);
    })

    // get a one spacific task by using task id for worker
    app.get('/singletasks/:id', verifyToken, async(req, res)=>{
      const taskId = req.params.id;
      const filter = { _id: new ObjectId(taskId) };
      const result = await tasksCollection.findOne(filter);
      res.send(result);
    })

    // post a submission into db for a worker
    app.post('/submission', verifyToken, async(req, res)=>{
      const submitTask = req.body;
      const {task_id} = submitTask;
      const updateRquiredWorker = await tasksCollection.updateOne(
        { _id: new ObjectId(task_id)},
        [
          {
            $set: {
              required_workers: {
                $toString: { $subtract: [{ $toInt: "$required_workers" }, 1] },
              },
            },
          },
        ]
      )
      const postResult  = await submissionCollection.insertOne(submitTask);
      res.send([postResult, updateRquiredWorker]);
    })

    // get all submission task by using worker email
    app.get('/submission/:email', verifyToken, async(req, res)=>{
      const email = req.params.email;
      const filter = { worker_email: email };
      const result = await submissionCollection.find(filter).sort({current_date: -1}).toArray();
      res.send(result);
    })

    // get all sumission task by using buyer email
    app.get('/submissionbuyer/:email', verifyToken, async(req, res)=>{
      const buyerMail = req.params.email;
      const filter = { Buyer_email: buyerMail };
      const result = await submissionCollection.find(filter).sort({current_date: -1}).toArray();
      res.send(result);
    })

    // approve submission api
    app.put('/submission/approve/:id', verifyToken, async(req, res)=>{
      const id = req.params.id;
      const {workerEmail, amount} = req.body;

      const updateSubmissionResult = await submissionCollection.updateOne(
        { _id: new ObjectId(id)},
        { $set: { status : 'approved' }}
      );

      // update worker coin
      const updateWorkerCoinResult = await usersCollection.updateOne(
        { userEmail: workerEmail},
        {$inc: { totalCoin: amount }}
      );
      res.send([updateSubmissionResult, updateWorkerCoinResult])
    });

    // submission reject api
    app.put('/submission/reject/:id', verifyToken, async(req, res)=>{
      const id = req.params.id;
      const {taskId} = req.body;

      const updateSubmissionResult = await submissionCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'rejected' } }
      );

       // Increase `required_workers` count for the task
    const updateTaskResult = await tasksCollection.updateOne(
      { _id: new ObjectId(taskId) },
      [
        {
          $set: {
            required_workers: {
              $toString: { $add: [{ $toInt: "$required_workers" }, 1] },
            },
          },
        },
      ]
    );
    res.send([updateSubmissionResult, updateTaskResult]);
    })

    // worker withdraw request post api
    app.post('/withdrawals', verifyToken, async(req, res)=>{
      const withdrawData = req.body;
      const result = await withdrawCollection.insertOne(withdrawData);
      res.send(result);
    })

    // get all pending withdraw req for admin
    app.get('/withdrawals', verifyToken, async(req, res)=>{
      const currentStatus = 'pending';
      const filter = { status: currentStatus }
      const result = await withdrawCollection.find(filter).toArray();
      res.send(result);
    })

    // approve withdraw api
    app.patch('/withdrawals/:id', verifyToken, async(req, res)=>{
      const withdrawId = req.params.id;

      // get withdrawal
      const withdrawal = await withdrawCollection.findOne({ _id: new ObjectId(withdrawId) });

      const { worker_email, withdrawal_coin } = withdrawal;

      // Update withdrawal request status to "approved"
      const updateWithdrawalResult = await withdrawCollection.updateOne(
        { _id: new ObjectId(withdrawId) },
        { $set: { status: 'approved' } }
      );

      // Deduct withdrawal coins from user
      const updateUserCoinsResult = await usersCollection.updateOne(
        { userEmail: worker_email },
        { $inc: { totalCoin: -withdrawal_coin } }
      );

      res.send([updateWithdrawalResult, updateUserCoinsResult])
    })

    // buyer states
    app.get('/buyer-stats/:email', verifyToken, async(req, res)=>{
      const buyerEmail = req.params.email;

      const totalTaskCount = await tasksCollection.countDocuments({buyerEmail});

      // get pending task worker
      const tasks = await tasksCollection.find({buyerEmail}).project({ required_workers: 
        1 }).toArray();
      
        const pendingWorkers = tasks.reduce((sum, task)=>{
          const workers = parseInt(task.required_workers, 10) || 0;
          return sum + workers
        }, 0);

        // get total payment

        const totalPyment = await paymentCollection.aggregate([
          { $match: {buyerEmail} },
          { $group: {_id: null, totalAmount: { $sum: "$coinsAdded" }} },
        ]).toArray();

        const totalPaid = totalPyment[0]?.totalAmount || 0;

        res.send({
          success: true,
          stats: {
            totalTaskCount,
            pendingWorkers,
            totalPaid,
          },
        })
    })

    // worker states
    app.get('/worker-stats/:email', async(req, res)=>{
      const workerEmail = req.params.email;
      console.log('Email', workerEmail)
      // get total submission
      const totalSubmissions = await submissionCollection.countDocuments({ worker_email: workerEmail });

      // get total pending submission
      const totalPendingSubmissions = await submissionCollection.countDocuments({         worker_email: workerEmail,
        status: 'pending'
       });

      // get total income
      const totalEarnings = await submissionCollection.aggregate([
        { $match: { worker_email: workerEmail, status: 'approved' } },
        { $group: { _id: null, totalAmount: { $sum: { $toInt: "$payable_amount" } } } },
      ]).toArray();

      const earnings = totalEarnings[0]?.totalAmount || 0;

     res.send({
      success: true,
      stats: {
        totalSubmissions,
        totalPendingSubmissions,
        totalEarnings: earnings
      },
     });
    });
    

    // admin stats
    app.get('/admin-stats',verifyToken, async(req, res)=>{
      // Total workers count
      const totalWorkers = await usersCollection.countDocuments({ role: 'worker' });

      // Total buyers count
      const totalBuyers = await usersCollection.countDocuments({ role: 'buyer' });

      // Total available coins (sum of all users' coins)
      const totalAvailableCoins = await usersCollection.aggregate([
        { $group: { _id: null, totalCoins: { $sum: "$totalCoin" } } }
      ]).toArray();
      const availableCoins = totalAvailableCoins[0]?.totalCoins || 0;

      // Total payments (sum of all payments)
      const totalPayments = await paymentCollection.aggregate([
        { $group: { _id: null, totalAmount: { $sum: "$amount" } } }
      ]).toArray();
      const totalPaid = totalPayments[0]?.totalAmount || 0;

      res.send({
        success: true,
        stats: {
          totalWorkers,
          totalBuyers,
          totalAvailableCoins: availableCoins,
          totalPayments: totalPaid,
        },
    });
    })

    // ure top worker 
    app.get('/top-workers', verifyToken, async(req, res)=>{
      const topWorker = await usersCollection.find({ role: 'worker' }).sort({totalCoin: -1}).limit(6).project({ name: 1, userPhoto: 1, totalCoin: 1 }).toArray();
      res.send(topWorker)
    });

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