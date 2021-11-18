const express = require('express');
const bodyParser = require('body-parser');
const { Op } = require('sequelize');

const { sequelize } = require('./model');
const { getProfile } = require('./middleware/getProfile');

const app = express();
app.use(bodyParser.json());
app.set('sequelize', sequelize);
app.set('models', sequelize.models);

/**
 * FIX ME!
 * @returns contract by id
 */
app.get('/contracts/:id', getProfile, async (req, res) => {
  const { Contract } = req.app.get('models');
  const { id } = req.params;
  const contract = await Contract.findOne({
    where: { id, ClientId: req.profile.id },
  });
  if (!contract)
    return res.status(404).json({ message: 'No contract found!!' });
  res.json(contract);
});

/**
 * GET Contracts
 * @returns contract for user
 */
app.get('/contracts', getProfile, async (req, res) => {
  const { Contract } = req.app.get('models');
  const { skip = 0, limit = 10 } = req.query;

  const contracts = await Contract.findAll({
    where: { ClientId: req.profile.id },
    offset: Number(skip),
    limit: Number(limit),
  });

  if (contracts.length === 0)
    return res.status(404).json({ message: 'No contract found!!' });

  return res.status(200).json(contract);
});

/**
 * GET Unpaid jobs
 * @returns Unpaid jobs for a user
 */
app.get('/jobs/unpaid', getProfile, async (req, res) => {
  const { Job, Contract } = req.app.get('models');
  const { skip = 0, limit = 10, status = 'in_progress' } = req.query;

  const jobs = await Job.findAll({
    where: { paid: null },
    include: [
      {
        model: Contract,
        where: { ClientId: req.profile.id, status },
        attributes: ['status'],
      },
    ],
    offset: Number(skip),
    limit: Number(limit),
  });
  if (jobs.length === 0)
    return res.status(404).json({ message: 'No jobs found!!' });

  return res.status(200).json(jobs);
});

/**
 * POST pay for job
 */
app.post('/jobs/:job_id/pay', async (req, res) => {
  const { Job, Contract, Profile } = req.app.get('models');
  const { job_id } = req.params;

  const job = await Job.findOne({
    where: { id: job_id },
    include: [
      {
        model: Contract,
        attributes: ['ClientId', 'ContractorId'],
      },
    ],
  });
  if (!job) return res.status(404).json({ message: 'No job found!!' });

  const [ContractorProfile, ClientProfile] = await Promise.all([
    Profile.findOne({
      where: { id: job.Contract.ContractorId },
    }),
    Profile.findOne({
      where: { id: job.Contract.ClientId },
    }),
  ]).catch((err) => console.log(err.message));

  if (ClientProfile.balance >= job.price && ContractorProfile) {
    ContractorProfile.balance += job.price;
    ContractorProfile.save();
    ClientProfile.balance -= job.price;
    ClientProfile.save();
  }

  return res.status(200).json({ message: '' });
});

app.post('/balances/deposit/:userId', async (req, res) => {
  const { Job, Contract, Profile } = req.app.get('models');
  const { userId } = req.params;

  const profile = await Profile.findOne({
    where: { id: userId },
  });
  if (!profile) return res.status(404).json({ message: 'User not found' });

  const { total_amount } = await Job.findAll({
    where: sequelize.or({ paid: null }),
    include: [
      {
        model: Contract,
        where: { ClientId: userId, status: 'in_progress' },
      },
    ],
    attributes: [[sequelize.fn('sum', sequelize.col('price')), 'total_amount']],
    raw: true,
  });

  const avg = (total_amount * 25) / 100;
  profile.balance += avg;
  profile.save();

  return res.status(200).json({ message: 'Balance updated' });
});

app.get('/admin/best-profession', async (req, res) => {
  const { Job, Contract } = req.app.get('models');
  const jobs = await Contract.findAll({
    attributes: [
      [sequelize.fn('max', sequelize.col('Jobs.total')), 'max_total'],
    ],
    include: [
      {
        model: Job,
        // as: 'job',
        attributes: [[sequelize.fn('sum', sequelize.col('price')), 'total']],
      },
    ],
    group: ['Contract.ContractorId'],
    raw: true,
    // order: [[{ model: Job }, 'total', 'DESC']],
  });

  console.log(jobs);
  return res.status(200).end();
});

module.exports = app;
