const Team = require('../models/Team');

// Create Team
exports.createTeam = async (req, res) => {
  try {
    const teamData = req.body;

    // Validate required fields
    if (!teamData.code || !teamData.name) {
      return res.status(400).json({
        success: false,
        error: 'Team code and name are required'
      });
    }

    // Check if team code already exists
    const existingTeam = await Team.findOne({ code: teamData.code.toUpperCase() });
    if (existingTeam) {
      return res.status(409).json({
        success: false,
        error: 'Team code already exists'
      });
    }

    // Create team
    const team = new Team({
      ...teamData,
      code: teamData.code.toUpperCase(),
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await team.save();

    console.log(`----->  Team created: ${team.code} - ${team.name}`);

    res.status(201).json({
      success: true,
      team,
      message: 'Team created successfully'
    });
  } catch (error) {
    console.error('----->  Create team error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Get Team by Code
exports.getTeam = async (req, res) => {
  try {
    const { code } = req.params;

    const team = await Team.findOne({ code: code.toUpperCase() });
    
    if (!team) {
      return res.status(404).json({
        success: false,
        error: 'Team not found'
      });
    }

    res.json({
      success: true,
      team
    });
  } catch (error) {
    console.error('----->  Get team error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Update Team (Sync)
exports.syncTeam = async (req, res) => {
  try {
    const { code, ...updateData } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Team code is required'
      });
    }

    // Find and update team
    const team = await Team.findOneAndUpdate(
      { code: code.toUpperCase() },
      { 
        ...updateData, 
        updatedAt: new Date() 
      },
      { 
        new: true, 
        upsert: true, // Create if doesn't exist
        runValidators: true 
      }
    );

    console.log(`----->  Team synced: ${code}`);

    // Emit Socket.IO event to team room
    if (global.io) {
      global.io.to(code.toUpperCase()).emit('team_updated', team);
    }

    res.json({
      success: true,
      team
    });
  } catch (error) {
    console.error('----->  Sync team error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Get Team Stats
exports.getTeamStats = async (req, res) => {
  try {
    const { code } = req.params;

    const team = await Team.findOne({ code: code.toUpperCase() });
    
    if (!team) {
      return res.status(404).json({
        success: false,
        error: 'Team not found'
      });
    }

    const stats = {
      totalMembers: team.members.length,
      totalTasks: team.tasks.length,
      completedTasks: team.tasks.filter(t => t.status === 'Done').length,
      progress: team.tasks.length > 0 
        ? Math.round((team.tasks.filter(t => t.status === 'Done').length / team.tasks.length) * 100)
        : 0,
      totalCommits: team.teamMetrics?.totalCommits || 0,
      lockedFiles: team.lockedFiles ? Object.keys(team.lockedFiles.toObject()).length : 0,
      onlineMembers: team.members.filter(m => m.isOnline).length
    };

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('----->  Get team stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Delete Team
exports.deleteTeam = async (req, res) => {
  try {
    const { code } = req.params;

    const team = await Team.findOneAndDelete({ code: code.toUpperCase() });
    
    if (!team) {
      return res.status(404).json({
        success: false,
        error: 'Team not found'
      });
    }

    console.log(`----->  Team deleted: ${code}`);

    res.json({
      success: true,
      message: 'Team deleted successfully'
    });
  } catch (error) {
    console.error('----->  Delete team error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Get All Teams (Admin)
exports.getAllTeams = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const teams = await Team.find()
      .select('code name members createdAt')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Team.countDocuments();

    res.json({
      success: true,
      teams: teams.map(team => ({
        code: team.code,
        name: team.name,
        memberCount: team.members.length,
        createdAt: team.createdAt
      })),
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      totalTeams: count
    });
  } catch (error) {
    console.error('----->  Get all teams error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Add Member to Team
exports.addMember = async (req, res) => {
  try {
    const { code } = req.params;
    const memberData = req.body;

    const team = await Team.findOne({ code: code.toUpperCase() });
    
    if (!team) {
      return res.status(404).json({
        success: false,
        error: 'Team not found'
      });
    }

    team.members.push(memberData);
    await team.save();

    console.log(`----->  Member added to team ${code}: ${memberData.name}`);

    // Emit Socket.IO event
    if (global.io) {
      global.io.to(code.toUpperCase()).emit('member_joined', {
        member: memberData,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      team,
      message: 'Member added successfully'
    });
  } catch (error) {
    console.error('----->  Add member error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Add Task to Team
exports.addTask = async (req, res) => {
  try {
    const { code } = req.params;
    const taskData = req.body;

    const team = await Team.findOne({ code: code.toUpperCase() });
    
    if (!team) {
      return res.status(404).json({
        success: false,
        error: 'Team not found'
      });
    }

    team.tasks.push(taskData);
    await team.save();

    console.log(`----->  Task added to team ${code}: ${taskData.title}`);

    // Emit Socket.IO event
    if (global.io) {
      global.io.to(code.toUpperCase()).emit('task_added', {
        task: taskData,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      team,
      message: 'Task added successfully'
    });
  } catch (error) {
    console.error('----->  Add task error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
