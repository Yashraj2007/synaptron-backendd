const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');

// Create team
router.post('/create', teamController.createTeam);

// Get team by code
router.get('/:code', teamController.getTeam);

// Sync team (update)
router.post('/sync', teamController.syncTeam);

// Get team stats
router.get('/:code/stats', teamController.getTeamStats);

// Delete team
router.delete('/:code', teamController.deleteTeam);

// Get all teams (admin)
router.get('/', teamController.getAllTeams);

// Add member
router.post('/:code/members', teamController.addMember);

// Add task
router.post('/:code/tasks', teamController.addTask);

module.exports = router;
