import prisma from '../lib/prisma.js';
import { askGroq, askGroqJSON, askGroqChat, extractJSON } from '../services/ai.service.js';
import * as prompts from '../services/ai.prompts.js';
import { requireProjectMember, sendAccessError } from '../utils/projectAccess.js';
import { emitToProject } from '../services/realtime.service.js';
import {
  assignBadgeByName,
  formatUserBadge,
  seedDefaultBadges,
  userBadgeInclude
} from '../services/badge.service.js';
import { extractTaskFromNLP } from '../services/nlpTask.service.js';
import { createNotification } from '../services/notification.service.js';
import { extractTasksFromMeetingNotes } from '../services/meetingNotes.service.js';

/**
 * Parse natural language text into structured task
 * POST /api/ai/parse-task
 */
export const parseTask = async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Text is required'
      });
    }

    const prompt = prompts.buildParseTaskPrompt(text);

    try {
      const parsed = await askGroqJSON(prompt);
      
      return res.json({
        success: true,
        data: {
          title: parsed.title || 'Untitled',
          assignee: parsed.assignee || null,
          dueDate: parsed.dueDate || null,
          priority: ['LOW', 'MEDIUM', 'HIGH'].includes(parsed.priority) ? parsed.priority : 'MEDIUM',
          description: parsed.description || ''
        }
      });
    } catch (parseError) {
      // Fallback: return basic parsing
      console.error('[Parse Task] JSON extraction failed:', parseError.message);
      
      const words = text.split(' ');
      return res.json({
        success: true,
        data: {
          title: text.substring(0, 100),
          assignee: null,
          dueDate: null,
          priority: 'MEDIUM',
          description: text
        },
        warning: 'Using basic parsing (AI parse failed)'
      });
    }

  } catch (error) {
    console.error('[Parse Task] Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to parse task',
      details: error.message
    });
  }
};

/**
 * Prioritize task using AI analysis
 * POST /api/ai/priority
 */
export const prioritizeTask = async (req, res) => {
  try {
    const { title, dueDays = 7, workload = 0 } = req.body;

    if (!title || title.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Title is required'
      });
    }

    const prompt = prompts.buildPrioritizePrompt(title, dueDays, workload);

    try {
      const result = await askGroqJSON(prompt);
      
      return res.json({
        success: true,
        data: {
          priority: ['LOW', 'MEDIUM', 'HIGH'].includes(result.priority) ? result.priority : 'MEDIUM',
          reasoning: result.reasoning || '',
          urgencyScore: Math.min(10, Math.max(1, parseInt(result.urgencyScore) || 5))
        }
      });
    } catch (parseError) {
      console.error('[Prioritize Task] JSON extraction failed:', parseError.message);
      
      // Fallback: basic heuristic
      let score = 5;
      if (dueDays <= 1) score = 9;
      else if (dueDays <= 3) score = 7;
      else if (dueDays <= 7) score = 5;

      if (workload > 5) score += 1;
      if (title.toLowerCase().includes('bug')) score += 2;
      if (title.toLowerCase().includes('urgent')) score += 3;

      const priority = score >= 8 ? 'HIGH' : score >= 5 ? 'MEDIUM' : 'LOW';

      return res.json({
        success: true,
        data: {
          priority,
          reasoning: 'Using heuristic analysis',
          urgencyScore: Math.min(10, score)
        },
        warning: 'Using basic priority calculation'
      });
    }

  } catch (error) {
    console.error('[Prioritize Task] Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to prioritize task',
      details: error.message
    });
  }
};

/**
 * Generate daily standup report
 * GET /api/ai/standup
 */
export const generateStandup = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const tasks = await prisma.task.findMany({
      where: { assigneeId: userId },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        deadline: true,
        description: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { updatedAt: 'desc' },
      take: 20
    });

    if (tasks.length === 0) {
      return res.json({
        success: true,
        data: {
          yesterday: 'No tasks in progress',
          today: 'No upcoming tasks',
          blockers: 'None'
        }
      });
    }

    const prompt = prompts.buildStandupPrompt(tasks);

    try {
      const report = await askGroqJSON(prompt);
      
      return res.json({
        success: true,
        data: {
          yesterday: report.yesterday || 'No tasks completed',
          today: report.today || 'No planned tasks',
          blockers: report.blockers || 'None'
        }
      });
    } catch (parseError) {
      console.error('[Generate Standup] JSON extraction failed:', parseError.message);
      
      // Fallback: generate basic standup
      const completed = tasks.filter(t => t.status === 'DONE');
      const inProgress = tasks.filter(t => t.status === 'IN_PROGRESS');
      const pending = tasks.filter(t => t.status === 'TODO');

      return res.json({
        success: true,
        data: {
          yesterday: `Completed ${completed.length} task${completed.length !== 1 ? 's' : ''}`,
          today: `Working on ${inProgress.length} task${inProgress.length !== 1 ? 's' : ''}, ${pending.length} pending`,
          blockers: inProgress.length > 3 ? 'High workload' : 'None'
        },
        warning: 'Using basic standup generation'
      });
    }

  } catch (error) {
    console.error('[Generate Standup] Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to generate standup',
      details: error.message
    });
  }
};
/**
 * Predict task completion risk
 * GET /api/ai/risk/:taskId
 */
export const riskPredictor = async (req, res) => {
  try {
    const { taskId } = req.params;

    const task = await prisma.task.findUnique({
      where: { id: taskId }
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    // Calculate days remaining
    let daysRemaining = null;
    if (task.deadline) {
      const now = new Date();
      const deadline = new Date(task.deadline);
      daysRemaining = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
    }

    const taskData = {
      ...task,
      daysRemaining
    };

    const prompt = prompts.buildRiskPrompt(taskData);

    try {
      const analysis = await askGroqJSON(prompt);
      
      return res.json({
        success: true,
        data: {
          taskId: task.id,
          title: task.title,
          riskLevel: ['LOW', 'MEDIUM', 'HIGH'].includes(analysis.riskLevel) ? analysis.riskLevel : 'MEDIUM',
          missProbability: Math.min(100, Math.max(0, parseInt(analysis.missProbability) || 50)),
          recommendations: Array.isArray(analysis.recommendations) ? analysis.recommendations : []
        }
      });
    } catch (parseError) {
      console.error('[Risk Predictor] JSON extraction failed:', parseError.message);
      
      // Fallback: calculate risk score
      let riskScore = 20;

      if (task.status !== 'DONE') riskScore += 30;
      if (task.priority === 'HIGH') riskScore += 20;

      if (daysRemaining !== null) {
        if (daysRemaining <= 1) riskScore += 40;
        else if (daysRemaining <= 3) riskScore += 25;
        else if (daysRemaining <= 7) riskScore += 10;
      }

      riskScore = Math.min(100, riskScore);

      const riskLevel = riskScore >= 70 ? 'HIGH' : riskScore >= 40 ? 'MEDIUM' : 'LOW';

      return res.json({
        success: true,
        data: {
          taskId: task.id,
          title: task.title,
          riskLevel,
          missProbability: riskScore,
          recommendations: []
        },
        warning: 'Using basic risk calculation'
      });
    }

  } catch (error) {
    console.error('[Risk Predictor] Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to predict risk',
      details: error.message
    });
  }
};
/**
 * Forecast project velocity and completion date
 * GET /api/ai/velocity/:projectId
 */
export const velocityForecast = async (req, res) => {
  try {
    const { projectId } = req.params;

    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    const tasks = await prisma.task.findMany({
      where: { projectId }
    });

    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'DONE').length;
    const pending = total - completed;

    // Calculate actual velocity
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const completedThisWeek = tasks.filter(
      t => t.status === 'DONE' && new Date(t.updatedAt) > oneWeekAgo
    ).length;

    const weeklyVelocity = completedThisWeek || (completed >= 10 ? 8 : 5);
    const weeksLeft = pending > 0 ? Math.ceil(pending / weeklyVelocity) : 0;

    const finishDate = new Date();
    finishDate.setDate(finishDate.getDate() + (weeksLeft * 7));

    const prompt = prompts.buildVelocityPrompt(
      project.name || 'Project',
      completed,
      pending,
      weeklyVelocity
    );

    try {
      const forecast = await askGroqJSON(prompt);
      
      return res.json({
        success: true,
        data: {
          projectId: project.id,
          totalTasks: total,
          completedTasks: completed,
          pendingTasks: pending,
          completionPercentage: Math.round((completed / total) * 100),
          weeklyVelocity: parseFloat(forecast.weeksRemaining) || weeklyVelocity,
          predictedFinishDate: forecast.predictedFinishDate || finishDate.toISOString().split('T')[0],
          confidence: forecast.confidence || 'MEDIUM',
          recommendation: forecast.recommendation || ''
        }
      });
    } catch (parseError) {
      console.error('[Velocity Forecast] JSON extraction failed:', parseError.message);
      
      return res.json({
        success: true,
        data: {
          projectId: project.id,
          totalTasks: total,
          completedTasks: completed,
          pendingTasks: pending,
          completionPercentage: Math.round((completed / total) * 100),
          weeklyVelocity,
          predictedFinishDate: finishDate.toISOString().split('T')[0],
          confidence: 'MEDIUM',
          recommendation: ''
        },
        warning: 'Using basic velocity calculation'
      });
    }

  } catch (error) {
    console.error('[Velocity Forecast] Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to forecast velocity',
      details: error.message
    });
  }
};
/**
 * Detect project bottlenecks
 * GET /api/ai/bottleneck
 */
export const bottleneckDetector = async (req, res) => {
  try {
    const tasks = await prisma.task.findMany({
      include: { assignee: true }
    });

    const users = await prisma.user.findMany();

    // Build bottleneck data
    const blockedTasks = tasks.filter(
      t => t.status !== 'DONE' && t.priority === 'HIGH'
    );

    const workload = {};
    tasks.forEach(task => {
      const userId = task.assigneeId || 'unassigned';
      workload[userId] = (workload[userId] || 0) + 1;
    });

    const taskData = {
      blockedHighPriorityTasks: blockedTasks.length,
      tasksByStatus: {
        todo: tasks.filter(t => t.status === 'TODO').length,
        inProgress: tasks.filter(t => t.status === 'IN_PROGRESS').length,
        done: tasks.filter(t => t.status === 'DONE').length
      },
      workload
    };

    const prompt = prompts.buildBotleneckDetectorPrompt(tasks, users);

    try {
      const analysis = await askGroqJSON(prompt);
      
      return res.json({
        success: true,
        data: {
          bottlenecks: Array.isArray(analysis.bottlenecks) ? analysis.bottlenecks : [],
          overloadedMembers: Array.isArray(analysis.overloadedMembers) ? analysis.overloadedMembers : [],
          recommendation: analysis.recommendation || '',
          summary: taskData
        }
      });
    } catch (parseError) {
      console.error('[Bottleneck Detector] JSON extraction failed:', parseError.message);
      
      // Fallback: identify overloaded user
      let overloadedUser = null;
      let maxTasks = 0;

      for (const [userId, count] of Object.entries(workload)) {
        if (count > maxTasks) {
          maxTasks = count;
          overloadedUser = userId;
        }
      }

      return res.json({
        success: true,
        data: {
          bottlenecks: [
            {
              type: 'overload',
              description: `User ${overloadedUser} has ${maxTasks} tasks`,
              impact: maxTasks
            }
          ],
          overloadedMembers: overloadedUser ? [overloadedUser] : [],
          recommendation: blockedTasks.length > 3 ? 'High priority tasks are blocked' : '',
          summary: taskData
        },
        warning: 'Using basic bottleneck detection'
      });
    }

  } catch (error) {
    console.error('[Bottleneck Detector] Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to detect bottlenecks',
      details: error.message
    });
  }
};
/**
 * Detect team member burnout risk
 * GET /api/ai/burnout
 */
export const burnoutDetector = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        tasks: true
      }
    });

    const analysisData = users.map(user => {
      const userTasks = user.tasks || [];
      const openTasks = userTasks.filter(t => t.status !== 'DONE').length;
      const highPriority = userTasks.filter(t => t.status !== 'DONE' && t.priority === 'HIGH').length;
      const overdue = userTasks.filter(
        t => t.deadline && new Date(t.deadline) < new Date() && t.status !== 'DONE'
      ).length;

      return {
        userId: user.id,
        name: user.name,
        openTasks,
        highPriority,
        overdue
      };
    });

    const prompt = prompts.buildBurnoutPrompt(analysisData);

    try {
      // For burnout, we might get multiple user analyses
      const aiResponse = await askGroq(prompt);
      let burnoutData = [];

      try {
        burnoutData = extractJSON(aiResponse);
        if (!Array.isArray(burnoutData)) {
          burnoutData = [burnoutData];
        }
      } catch (e) {
        // Fall back to basic calculation
        burnoutData = analysisData.map(user => {
          let score = 0;
          score += user.openTasks * 5;
          score += user.highPriority * 10;
          score += user.overdue * 15;

          const riskLevel = score >= 60 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'LOW';

          return {
            userId: user.userId,
            name: user.name,
            riskLevel,
            score,
            factors: []
          };
        });
      }

      return res.json({
        success: true,
        data: burnoutData
      });
    } catch (parseError) {
      console.error('[Burnout Detector] AI call failed:', parseError.message);
      
      // Fallback: calculate burnout score for each user
      const results = analysisData.map(user => {
        let score = 0;
        score += user.openTasks * 5;
        score += user.highPriority * 10;
        score += user.overdue * 15;

        const riskLevel = score >= 60 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'LOW';

        return {
          userId: user.userId,
          name: user.name,
          riskLevel,
          score,
          factors: []
        };
      });

      return res.json({
        success: true,
        data: results,
        warning: 'Using basic burnout calculation'
      });
    }

  } catch (error) {
    console.error('[Burnout Detector] Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to detect burnout',
      details: error.message
    });
  }
};
/**
 * Analyze team sentiment from comments and messages
 * GET /api/ai/sentiment
 */
export const sentimentAnalysis = async (req, res) => {
  try {
    const comments = await prisma.taskComment.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' }
    });

    if (comments.length === 0) {
      return res.json({
        success: true,
        data: {
          overallMood: 'neutral',
          score: 50,
          concerns: [],
          highlights: [],
          totalComments: 0
        }
      });
    }

    const commentTexts = comments.map(c => c.message);
    const prompt = prompts.buildSentimentPrompt(commentTexts);

    try {
      const sentiment = await askGroqJSON(prompt);
      
      return res.json({
        success: true,
        data: {
          overallMood: sentiment.overallMood || 'neutral',
          score: Math.min(100, Math.max(0, parseInt(sentiment.score) || 50)),
          concerns: Array.isArray(sentiment.concerns) ? sentiment.concerns : [],
          highlights: Array.isArray(sentiment.highlights) ? sentiment.highlights : [],
          totalComments: comments.length
        }
      });
    } catch (parseError) {
      console.error('[Sentiment Analysis] JSON extraction failed:', parseError.message);
      
      // Fallback: keyword-based sentiment
      const positiveWords = ['good', 'great', 'done', 'nice', 'happy', 'success', 'awesome', 'excellent'];
      const negativeWords = ['delay', 'bad', 'stuck', 'issue', 'problem', 'late', 'broken', 'failed'];

      let score = 50;
      comments.forEach(comment => {
        const text = comment.message.toLowerCase();
        positiveWords.forEach(word => {
          if (text.includes(word)) score += 2;
        });
        negativeWords.forEach(word => {
          if (text.includes(word)) score -= 2;
        });
      });

      score = Math.min(100, Math.max(0, score));

      const mood = score >= 65 ? 'positive' : score <= 40 ? 'negative' : 'neutral';

      return res.json({
        success: true,
        data: {
          overallMood: mood,
          score,
          concerns: [],
          highlights: [],
          totalComments: comments.length
        },
        warning: 'Using basic sentiment calculation'
      });
    }

  } catch (error) {
    console.error('[Sentiment Analysis] Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze sentiment',
      details: error.message
    });
  }
};
/**
 * Generate task dependency graph
 * GET /api/ai/dependency/:projectId
 */
export const dependencyGraph = async (req, res) => {
  try {
    const { projectId } = req.params;

    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    const tasks = await prisma.task.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' }
    });

    if (tasks.length === 0) {
      return res.json({
        success: true,
        data: {
          nodes: [],
          links: [],
          criticalPath: []
        }
      });
    }

    const prompt = prompts.buildDependencyGraphPrompt(tasks);

    try {
      const graph = await askGroqJSON(prompt);

      return res.json({
        success: true,
        data: {
          nodes: graph.nodes || tasks.map(task => ({
            id: task.id,
            label: task.title,
            status: task.status,
            priority: task.priority
          })),
          links: Array.isArray(graph.dependencies) ? graph.dependencies : graph.links || [],
          criticalPath: Array.isArray(graph.criticalPath) ? graph.criticalPath : [],
          summary: graph.summary || ''
        }
      });
    } catch (parseError) {
      console.error('[Dependency Graph] JSON extraction failed:', parseError.message);

      // Fallback: create simple linear dependencies
      const links = [];
      for (let i = 1; i < tasks.length; i++) {
        if (
          tasks[i].title.toLowerCase().includes('deploy') ||
          tasks[i].title.toLowerCase().includes('test') ||
          tasks[i].title.toLowerCase().includes('release')
        ) {
          links.push({
            from: tasks[i - 1].id,
            to: tasks[i].id,
            type: 'precedes'
          });
        }
      }

      return res.json({
        success: true,
        data: {
          nodes: tasks.map(task => ({
            id: task.id,
            label: task.title,
            status: task.status,
            priority: task.priority
          })),
          links,
          criticalPath: tasks.filter(t => t.priority === 'HIGH').map(t => t.id),
          summary: 'Using basic dependency detection'
        },
        warning: 'Using basic dependency detection'
      });
    }

  } catch (error) {
    console.error('[Dependency Graph] Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to generate dependency graph',
      details: error.message
    });
  }
};

/**
 * Plan sprint allocation
 * POST /api/ai/sprint-plan
 */
export const sprintPlanner = async (req, res) => {
  try {
    const { projectId, capacityHours = 40 } = req.body;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: 'projectId is required'
      });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    const tasks = await prisma.task.findMany({
      where: {
        projectId,
        status: { not: 'DONE' }
      },
      orderBy: { priority: 'desc' }
    });

    const prompt = prompts.buildSprintPlanPrompt(tasks, capacityHours);

    try {
      const plan = await askGroqJSON(prompt);

      return res.json({
        success: true,
        data: {
          projectId,
          selectedTasks: Array.isArray(plan.sprintTasks) ? plan.sprintTasks : [],
          totalHours: parseFloat(plan.totalHours) || 0,
          remainingCapacity: parseFloat(plan.remainingCapacity) || capacityHours,
          note: plan.note || ''
        }
      });
    } catch (parseError) {
      console.error('[Sprint Planner] JSON extraction failed:', parseError.message);

      // Fallback: greedy algorithm
      let used = 0;
      const sprint = [];

      for (const task of tasks) {
        const hours = task.estimatedHours || 2;
        if (used + hours <= capacityHours) {
          sprint.push({
            id: task.id,
            title: task.title,
            estimatedHours: hours
          });
          used += hours;
        }
      }

      return res.json({
        success: true,
        data: {
          projectId,
          selectedTasks: sprint,
          totalHours: used,
          remainingCapacity: capacityHours - used,
          note: 'Using basic allocation'
        },
        warning: 'Using basic sprint planning'
      });
    }

  } catch (error) {
    console.error('[Sprint Planner] Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to plan sprint',
      details: error.message
    });
  }
};

/**
 * Extract tasks from meeting notes
 * POST /api/ai/notes-to-tasks
 */
export const notesToTasks = async (req, res) => {
  try {
    const { projectId, notes } = req.body;

    if (!projectId || !notes || notes.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'projectId and notes are required'
      });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    const prompt = prompts.buildNotesPrompt(notes);

    try {
      const taskItems = await askGroqJSON(prompt);
      const items = Array.isArray(taskItems) ? taskItems : [taskItems];

      const created = [];

      for (const item of items) {
        if (!item.title || item.title.trim().length === 0) continue;

        const task = await prisma.task.create({
          data: {
            title: item.title,
            description: item.description || `Extracted from: ${notes.substring(0, 100)}`,
            priority: ['LOW', 'MEDIUM', 'HIGH'].includes(item.priority) ? item.priority : 'MEDIUM',
            projectId,
            status: 'TODO'
          }
        });

        created.push(task);
      }

      return res.json({
        success: true,
        data: {
          createdCount: created.length,
          tasks: created
        }
      });
    } catch (parseError) {
      console.error('[Notes to Tasks] JSON extraction failed:', parseError.message);

      // Fallback: simple line-by-line extraction
      const lines = notes.split('\n').filter(l => l.trim().length > 0);
      const created = [];

      for (const line of lines.slice(0, 10)) {
        if (line.length < 10) continue;

        const task = await prisma.task.create({
          data: {
            title: line.substring(0, 100),
            description: notes,
            priority: 'MEDIUM',
            projectId,
            status: 'TODO'
          }
        });

        created.push(task);
      }

      return res.json({
        success: true,
        data: {
          createdCount: created.length,
          tasks: created
        },
        warning: 'Using basic note extraction'
      });
    }

  } catch (error) {
    console.error('[Notes to Tasks] Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to extract tasks from notes',
      details: error.message
    });
  }
};



/**
 * Start pomodoro focus session
 * POST /api/ai/pomodoro/start
 */
export const startPomodoro = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { taskId, minutes = 25 } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const session = await prisma.focusSession.create({
      data: {
        userId,
        taskId,
        minutes: parseInt(minutes) || 25
      }
    });

    res.json({
      success: true,
      message: 'Focus session logged',
      data: {
        session
      }
    });

  } catch (error) {
    console.error('[Start Pomodoro] Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to start pomodoro session',
      details: error.message
    });
  }
};

/**
 * Get pomodoro focus statistics
 * GET /api/ai/pomodoro/stats
 */
export const focusStats = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const sessions = await prisma.focusSession.findMany({
      where: { userId }
    });

    const totalMinutes = sessions.reduce((sum, s) => sum + (s.minutes || 0), 0);

    res.json({
      success: true,
      data: {
        totalSessions: sessions.length,
        totalMinutes,
        totalHours: (totalMinutes / 60).toFixed(1),
        averageMinutesPerSession: sessions.length > 0 ? (totalMinutes / sessions.length).toFixed(1) : 0
      }
    });

  } catch (error) {
    console.error('[Focus Stats] Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get focus stats',
      details: error.message
    });
  }
};

/**
 * Check and award badges to users
 * POST /api/ai/badges/check
 */
export const awardBadges = async (req, res) => {
  try {
    await seedDefaultBadges();

    const users = await prisma.user.findMany({
      include: {
        tasks: true,
        projectMembers: true
      }
    });
    const badgesAwarded = [];
    const now = new Date();

    for (const user of users) {
      const tasks = user.tasks || [];
      const completedTasks = tasks.filter(task => task.status === 'DONE');
      const bugTasks = completedTasks.filter(task =>
        `${task.title} ${task.description || ''}`.toLowerCase().includes('bug')
      );
      const deadlineTasks = completedTasks.filter(task => task.deadline);
      const overdueOpenTasks = tasks.filter(task =>
        task.status !== 'DONE' &&
        task.deadline &&
        new Date(task.deadline) < now
      );

      const rules = [
        { passes: (user.xpPoints || 0) >= 100, badgeName: 'Top Performer' },
        { passes: completedTasks.length >= 10, badgeName: 'Sprint Champion' },
        { passes: bugTasks.length >= 3, badgeName: 'Bug Slayer' },
        { passes: deadlineTasks.length >= 5, badgeName: 'Deadline Master' },
        { passes: (user.projectMembers || []).length >= 2, badgeName: 'Team Player' },
        { passes: tasks.length > 0 && overdueOpenTasks.length === 0, badgeName: 'No Delay Hero' }
      ];

      for (const rule of rules) {
        if (!rule.passes) continue;

        const userBadge = await assignBadgeByName({
          userId: user.id,
          badgeName: rule.badgeName,
          assignedById: req.user.id
        });

        if (userBadge) {
          badgesAwarded.push(formatUserBadge(userBadge));
        }
      }
    }

    res.json({
      success: true,
      message: 'Badges checked and awarded',
      data: {
        badgesAwarded: badgesAwarded.length,
        badges: badgesAwarded
      },
      badgesAwarded: badgesAwarded.length,
      badges: badgesAwarded
    });

  } catch (error) {
    console.error('[Award Badges] Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to award badges',
      details: error.message
    });
  }
};

/**
 * Get leaderboard
 * GET /api/ai/leaderboard
 */
export const leaderboard = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { xpPoints: 'desc' },
      take: 10,
      select: {
        id: true,
        name: true,
        email: true,
        xpPoints: true,
        avatarUrl: true,
        userBadges: {
          include: userBadgeInclude,
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    res.json({
      success: true,
      data: users.map((user, index) => {
        const badgeDetails = (user.userBadges || []).map(formatUserBadge);

        return {
          rank: index + 1,
          id: user.id,
          userId: user.id,
          name: user.name,
          userName: user.name,
          email: user.email,
          xp: user.xpPoints,
          xpPoints: user.xpPoints,
          points: user.xpPoints,
          avatarUrl: user.avatarUrl,
          avatar: user.avatarUrl,
          badges: badgeDetails.map(badge => badge.name),
          badgeDetails
        };
      })
    });

  } catch (error) {
    console.error('[Leaderboard] Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get leaderboard',
      details: error.message
    });
  }
};

/**
 * Handle voice command from frontend, convert via AI and create task
 * POST /api/ai/voice-command
 */
/**
 * F27 — Voice Command Interface (upgraded)
 * POST /api/ai/voice-command
 *
 * Classifies the voice transcript into one of 5 intents:
 *   CREATE_TASK  → uses F12 NLP service to create real task
 *   UPDATE_STATUS → finds task by name, updates status
 *   QUERY_TASKS  → returns matching tasks list
 *   NAVIGATE     → returns navigation hint for frontend router
 *   GENERAL      → passes to chatWithAI style response
 */
export const voiceCommand = async (req, res) => {
  try {
    const userId  = req.user?.id;
    const { projectId, command, transcript } = req.body;
    const text = (transcript || command || '').trim();

    if (!text) {
      return res.status(400).json({ success: false, error: 'transcript/command is required' });
    }
    if (!projectId) {
      return res.status(400).json({ success: false, error: 'projectId is required' });
    }

    // ── Validate membership ────────────────────────────────────────────────
    let membership = null;
    try {
      const access = await requireProjectMember(projectId, req.user);
      membership = access.membership;
    } catch (accessError) {
      return sendAccessError(res, accessError);
    }

    console.log('[VoiceCommand] Transcript:', text);

    // ── Classify intent via Groq ───────────────────────────────────────────
    const classifyMessages = [
      {
        role: 'system',
        content: `You are a voice command classifier for a project management app.

Classify the user's voice command into EXACTLY ONE of these intents:
- CREATE_TASK   : user wants to create a new task
- UPDATE_STATUS : user wants to mark/update a task status
- QUERY_TASKS   : user wants to see/list tasks
- NAVIGATE      : user wants to go to a page/section
- GENERAL       : anything else

ALSO extract any relevant details:
- For CREATE_TASK: taskTitle, assigneeName, priority (LOW/MEDIUM/HIGH), deadline
- For UPDATE_STATUS: taskTitle, newStatus (TODO/IN_PROGRESS/DONE)
- For NAVIGATE: destination (dashboard/kanban/analytics/tasks/team/reports/focus/settings/ai)
- For QUERY_TASKS: filterStatus (TODO/IN_PROGRESS/DONE/ALL)

TODAY: ${new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' })}

Respond ONLY with valid JSON, no explanation:
{
  "intent": "CREATE_TASK|UPDATE_STATUS|QUERY_TASKS|NAVIGATE|GENERAL",
  "taskTitle": "string or null",
  "assigneeName": "string or null",
  "priority": "LOW|MEDIUM|HIGH|null",
  "deadline": "YYYY-MM-DD or weekday string or null",
  "newStatus": "TODO|IN_PROGRESS|DONE|null",
  "destination": "string or null",
  "filterStatus": "TODO|IN_PROGRESS|DONE|ALL|null",
  "confidence": 0.0-1.0
}`
      },
      { role: 'user', content: text }
    ];

    let classified = null;
    try {
      const raw = await askGroqChat(classifyMessages, { temperature: 0.1, maxTokens: 256 });
      classified = extractJSON(raw);
      console.log('[VoiceCommand] Classification:', classified);
    } catch (classErr) {
      console.warn('[VoiceCommand] Classification failed, falling back to heuristic:', classErr.message);
      classified = heuristicClassify(text);
    }

    const intent = classified?.intent || 'GENERAL';

    // ─────────────────────────────────────────────────────────────────────────
    // INTENT: CREATE_TASK  →  delegate to F12 NLP service
    // ─────────────────────────────────────────────────────────────────────────
    if (intent === 'CREATE_TASK') {
      const { extractTaskFromNLP } = await import('../services/nlpTask.service.js');

      // Fetch project members for assignee resolution
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          members: { include: { user: { select: { id:true, name:true, email:true } } } },
          owner:   { select: { id:true, name:true, email:true } }
        }
      });

      const allMembers = [project.owner, ...project.members.map(m => m.user)].filter(Boolean);

      // Extract structured fields via Groq NLP
      const extracted = await extractTaskFromNLP(text);
      console.log('[VoiceCommand] Extracted task fields:', extracted);

      // Resolve assignee
      let assigneeId = null;
      let resolvedAssignee = null;
      if (extracted.assigneeName) {
        const nl = extracted.assigneeName.toLowerCase();
        resolvedAssignee = allMembers.find(m => m.name.toLowerCase() === nl)
          || allMembers.find(m => m.name.toLowerCase().includes(nl) || nl.includes(m.name.toLowerCase().split(' ')[0]));
        if (resolvedAssignee) assigneeId = resolvedAssignee.id;
      }

      // Permission check for assignment
      const isAdmin = req.user.role === 'ADMIN' || membership?.role === 'ADMIN' || membership?.role === 'OWNER';
      if (assigneeId && assigneeId !== userId && !isAdmin) {
        assigneeId = userId;
        resolvedAssignee = allMembers.find(m => m.id === userId) || null;
      }

      const task = await prisma.task.create({
        data: {
          title: extracted.title,
          description: extracted.description || null,
          projectId,
          assigneeId: assigneeId || null,
          priority: extracted.priority || 'MEDIUM',
          status: 'TODO',
          deadline: extracted.deadline ? new Date(extracted.deadline) : null,
        },
        include: {
          assignee: { select: { id:true, name:true, email:true } },
          project:  { select: { id:true, name:true } },
        }
      });

      emitToProject(projectId, 'task-created', task);
      emitToProject(projectId, 'board-updated', { projectId, action:'task-created', task });

      if (assigneeId && assigneeId !== userId) {
        try {
          await createNotification(assigneeId, '🎙️ Voice Task Assigned',
            `"${task.title}" was created via voice command and assigned to you.`);
        } catch (_) {}
      }

      return res.status(201).json({
        success: true,
        intent: 'CREATE_TASK',
        data: {
          task,
          extracted: {
            title: extracted.title,
            assigneeName: resolvedAssignee?.name || extracted.assigneeName || null,
            priority: extracted.priority,
            deadline: extracted.deadline,
            projectName: project.name,
          },
          message: `✅ Task "${task.title}" created in ${project.name}`,
          response: `Done! I created "${task.title}"${resolvedAssignee ? ` and assigned it to ${resolvedAssignee.name}` : ''}${extracted.priority !== 'MEDIUM' ? ` with ${extracted.priority} priority` : ''}.`,
        }
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INTENT: UPDATE_STATUS
    // ─────────────────────────────────────────────────────────────────────────
    if (intent === 'UPDATE_STATUS') {
      const targetTitle = classified.taskTitle || text;
      const newStatus   = classified.newStatus || 'DONE';
      const validStatuses = ['TODO', 'IN_PROGRESS', 'DONE'];
      const normalizedStatus = validStatuses.includes(newStatus) ? newStatus : 'DONE';

      // Search for the task by title (fuzzy) in this project
      const tasks = await prisma.task.findMany({
        where: {
          projectId,
          title: { contains: targetTitle.split(' ').filter(w => w.length > 3)[0] || targetTitle, mode: 'insensitive' }
        },
        take: 5,
        include: { assignee: { select: { id:true, name:true } } }
      });

      if (tasks.length === 0) {
        return res.json({
          success: true,
          intent: 'UPDATE_STATUS',
          data: { found: false },
          response: `I couldn't find a task matching "${targetTitle}" in this project. Can you be more specific?`,
        });
      }

      const task = tasks[0]; // Best match
      const updated = await prisma.task.update({
        where: { id: task.id },
        data: {
          status: normalizedStatus,
          completedAt: normalizedStatus === 'DONE' ? new Date() : null
        },
        include: {
          assignee: { select: { id:true, name:true } },
          project:  { select: { id:true, name:true } }
        }
      });

      emitToProject(projectId, 'task-updated', updated);

      const statusLabel = { TODO: 'To Do', IN_PROGRESS: 'In Progress', DONE: 'Done' }[normalizedStatus] || normalizedStatus;
      return res.json({
        success: true,
        intent: 'UPDATE_STATUS',
        data: { task: updated },
        response: `Got it! "${updated.title}" is now marked as ${statusLabel}.`,
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INTENT: QUERY_TASKS
    // ─────────────────────────────────────────────────────────────────────────
    if (intent === 'QUERY_TASKS') {
      const filterStatus = classified.filterStatus && classified.filterStatus !== 'ALL'
        ? classified.filterStatus : undefined;

      const tasks = await prisma.task.findMany({
        where: {
          projectId,
          ...(filterStatus ? { status: filterStatus } : {}),
        },
        include: {
          assignee: { select: { id:true, name:true } }
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      });

      const label = filterStatus
        ? { TODO:'pending', IN_PROGRESS:'in progress', DONE:'completed' }[filterStatus] || filterStatus
        : 'total';

      const summary = tasks.length > 0
        ? tasks.slice(0, 5).map(t => `"${t.title}" — ${t.status}${t.assignee ? `, assigned to ${t.assignee.name}` : ''}`).join('; ')
        : 'No tasks found';

      return res.json({
        success: true,
        intent: 'QUERY_TASKS',
        data: { tasks, count: tasks.length, filter: filterStatus || 'ALL' },
        response: `You have ${tasks.length} ${label} task${tasks.length !== 1 ? 's' : ''}. ${tasks.length > 0 ? `Latest: ${summary}` : ''}`,
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INTENT: NAVIGATE
    // ─────────────────────────────────────────────────────────────────────────
    if (intent === 'NAVIGATE') {
      const dest = (classified.destination || '').toLowerCase();
      const routeMap = {
        dashboard: '/dashboard', home: '/dashboard',
        kanban: '/board', board: '/board',
        tasks: '/tasks', task: '/tasks',
        analytics: '/analytics', reports: '/reports',
        team: '/team', members: '/team',
        ai: '/ai', assistant: '/ai',
        focus: '/focus', pomodoro: '/focus',
        settings: '/settings',
        notifications: '/notifications',
        leaderboard: '/leaderboard',
        chat: '/chat',
      };

      const route = routeMap[dest] || `/${dest}` || '/dashboard';
      const label = dest.charAt(0).toUpperCase() + dest.slice(1) || 'Dashboard';

      return res.json({
        success: true,
        intent: 'NAVIGATE',
        data: { route, destination: dest },
        response: `Navigating to ${label}…`,
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INTENT: GENERAL  →  conversational AI response
    // ─────────────────────────────────────────────────────────────────────────
    const generalMessages = [
      {
        role: 'system',
        content: `You are the SmartOps AI voice assistant. Answer helpfully and concisely in 1-2 sentences. 
Today is ${new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' })}.`
      },
      { role: 'user', content: text }
    ];

    let generalResponse = 'I heard you! How can I help with your project?';
    try {
      generalResponse = await askGroqChat(generalMessages, { temperature: 0.5, maxTokens: 200 });
    } catch (_) {}

    return res.json({
      success: true,
      intent: 'GENERAL',
      data: {},
      response: generalResponse,
    });

  } catch (error) {
    console.error('[VoiceCommand] Error:', error.message);
    return res.status(500).json({ success: false, error: 'Voice command failed', details: error.message });
  }
};

/** Basic keyword-based intent classifier (fallback when Groq unavailable) */
function heuristicClassify(text) {
  const lower = text.toLowerCase();
  if (/\b(create|add|make|assign|build|new task)\b/.test(lower)) return { intent:'CREATE_TASK' };
  if (/\b(mark|set|update|change|move|complete|done|finish)\b/.test(lower)) return { intent:'UPDATE_STATUS', newStatus:'DONE' };
  if (/\b(show|list|get|find|what|display|pending|my tasks)\b/.test(lower)) return { intent:'QUERY_TASKS', filterStatus:'ALL' };
  if (/\b(go to|open|navigate|take me|show me the)\b/.test(lower)) {
    const dest = lower.match(/\b(dashboard|board|kanban|tasks|analytics|team|focus|settings|reports|ai|notifications)\b/)?.[1] || 'dashboard';
    return { intent:'NAVIGATE', destination: dest };
  }
  return { intent:'GENERAL' };
}

/**
 * General AI Chat Endpoint — Database-Aware MCP Architecture
 * POST /api/ai/chat
 * 
 * Searches the database for relevant tasks, projects, members based on user query,
 * then sends structured data context to Groq with a strict system prompt.
 */
export const chatWithAI = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { message, projectId } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    // ──────────────────────────────────────────────
    // 1. EXTRACT SEARCH KEYWORDS from user message
    // ──────────────────────────────────────────────
    const stopWords = new Set([
      'the', 'is', 'a', 'an', 'of', 'for', 'to', 'in', 'on', 'at', 'by',
      'and', 'or', 'not', 'it', 'this', 'that', 'with', 'from', 'as', 'are',
      'was', 'were', 'be', 'been', 'has', 'have', 'had', 'do', 'does', 'did',
      'can', 'could', 'will', 'would', 'should', 'may', 'might', 'shall',
      'what', 'when', 'where', 'who', 'whom', 'which', 'how', 'why',
      'my', 'me', 'i', 'you', 'your', 'we', 'our', 'they', 'their', 'its',
      'about', 'all', 'any', 'many', 'much', 'some', 'no', 'yes',
      'tell', 'show', 'give', 'get', 'find', 'list', 'please', 'thanks',
      'task', 'tasks', 'project', 'projects', 'deadline', 'status', 'priority',
      'assigned', 'assignee', 'member', 'members', 'team', 'work', 'working'
    ]);

    const keywords = message
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2 && !stopWords.has(w));

    // Deduplicate
    const uniqueKeywords = [...new Set(keywords)];

    console.log('[ChatWithAI] Keywords extracted:', uniqueKeywords);

    // ──────────────────────────────────────────────
    // 2. FETCH CURRENT USER with their projects
    // ──────────────────────────────────────────────
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        projectMembers: {
          include: {
            project: {
              select: { id: true, name: true, description: true }
            }
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get all project IDs user belongs to
    const userProjectIds = user.projectMembers.map(pm => pm.project.id);

    // ──────────────────────────────────────────────
    // 3. INTELLIGENT DATABASE SEARCH
    // ──────────────────────────────────────────────

    // 3a. Search tasks matching keywords (title + description)
    const taskSearchConditions = uniqueKeywords.map(keyword => ({
      OR: [
        { title: { contains: keyword, mode: 'insensitive' } },
        { description: { contains: keyword, mode: 'insensitive' } }
      ]
    }));

    let matchedTasks = [];
    if (taskSearchConditions.length > 0) {
      matchedTasks = await prisma.task.findMany({
        where: {
          AND: [
            { projectId: { in: userProjectIds.length > 0 ? userProjectIds : undefined } },
            { OR: taskSearchConditions }
          ]
        },
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          project: { select: { id: true, name: true } }
        },
        orderBy: { updatedAt: 'desc' },
        take: 20
      });
    }

    // If no keyword matches, fetch user's recent tasks
    if (matchedTasks.length === 0) {
      matchedTasks = await prisma.task.findMany({
        where: {
          OR: [
            { assigneeId: userId },
            ...(userProjectIds.length > 0 ? [{ projectId: { in: userProjectIds } }] : [])
          ]
        },
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          project: { select: { id: true, name: true } }
        },
        orderBy: { updatedAt: 'desc' },
        take: 30
      });
    }

    // 3b. Search projects matching keywords
    let matchedProjects = [];
    if (uniqueKeywords.length > 0) {
      const projectSearchConditions = uniqueKeywords.map(keyword => ({
        OR: [
          { name: { contains: keyword, mode: 'insensitive' } },
          { description: { contains: keyword, mode: 'insensitive' } }
        ]
      }));

      matchedProjects = await prisma.project.findMany({
        where: {
          AND: [
            { id: { in: userProjectIds.length > 0 ? userProjectIds : undefined } },
            { OR: projectSearchConditions }
          ]
        },
        include: {
          tasks: {
            include: {
              assignee: { select: { id: true, name: true, email: true } }
            },
            orderBy: { updatedAt: 'desc' },
            take: 30
          },
          members: {
            include: {
              user: { select: { id: true, name: true, email: true } }
            }
          }
        },
        take: 5
      });
    }

    // 3c. Search members matching keywords
    let matchedMembers = [];
    if (uniqueKeywords.length > 0) {
      const memberSearchConditions = uniqueKeywords.map(keyword => ({
        name: { contains: keyword, mode: 'insensitive' }
      }));

      matchedMembers = await prisma.user.findMany({
        where: { OR: memberSearchConditions },
        select: {
          id: true,
          name: true,
          email: true,
          tasks: {
            where: { status: { not: 'DONE' } },
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
              deadline: true,
              project: { select: { name: true } }
            },
            orderBy: { updatedAt: 'desc' },
            take: 10
          }
        },
        take: 5
      });
    }

    // 3d. Fetch specific project context if projectId is provided
    let activeProject = null;
    if (projectId) {
      activeProject = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          tasks: {
            include: {
              assignee: { select: { id: true, name: true, email: true } }
            },
            orderBy: { updatedAt: 'desc' }
          },
          members: {
            include: {
              user: { select: { id: true, name: true, email: true } }
            }
          }
        }
      });
    }

    console.log('[ChatWithAI] DB search results:', {
      matchedTasks: matchedTasks.length,
      matchedProjects: matchedProjects.length,
      matchedMembers: matchedMembers.length,
      activeProject: activeProject?.name || 'none'
    });

    // ──────────────────────────────────────────────
    // 4. BUILD STRUCTURED DATA CONTEXT
    // ──────────────────────────────────────────────

    // Format tasks into readable data
    const formatTask = (t) => {
      const parts = [`Title: "${t.title}"`];
      parts.push(`Status: ${t.status}`);
      parts.push(`Priority: ${t.priority}`);
      if (t.deadline) parts.push(`Deadline: ${new Date(t.deadline).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
      else parts.push('Deadline: Not set');
      if (t.assignee) parts.push(`Assigned to: ${t.assignee.name} (${t.assignee.email})`);
      else parts.push('Assigned to: Unassigned');
      if (t.project) parts.push(`Project: ${t.project.name}`);
      if (t.description) parts.push(`Description: ${t.description.substring(0, 200)}`);
      if (t.estimatedHours) parts.push(`Estimated hours: ${t.estimatedHours}`);
      return parts.join(' | ');
    };

    let dataContext = '';

    // Add matched tasks
    if (matchedTasks.length > 0) {
      dataContext += `\n=== MATCHED TASKS (${matchedTasks.length} found) ===\n`;
      matchedTasks.forEach((t, i) => {
        dataContext += `${i + 1}. ${formatTask(t)}\n`;
      });
    }

    // Add matched projects
    if (matchedProjects.length > 0) {
      dataContext += `\n=== MATCHED PROJECTS ===\n`;
      matchedProjects.forEach(p => {
        const total = p.tasks.length;
        const done = p.tasks.filter(t => t.status === 'DONE').length;
        const inProgress = p.tasks.filter(t => t.status === 'IN_PROGRESS').length;
        const todo = p.tasks.filter(t => t.status === 'TODO').length;
        const members = p.members.map(m => m.user?.name || 'Unknown').join(', ');

        dataContext += `Project: "${p.name}"\n`;
        dataContext += `  Description: ${p.description || 'None'}\n`;
        dataContext += `  Team: ${members}\n`;
        dataContext += `  Tasks — Total: ${total}, Done: ${done}, In Progress: ${inProgress}, To Do: ${todo}\n`;

        if (p.tasks.length > 0) {
          dataContext += `  Task details:\n`;
          p.tasks.forEach((t, i) => {
            dataContext += `    ${i + 1}. ${formatTask(t)}\n`;
          });
        }
      });
    }

    // Add matched members
    if (matchedMembers.length > 0) {
      dataContext += `\n=== MATCHED TEAM MEMBERS ===\n`;
      matchedMembers.forEach(m => {
        dataContext += `Member: ${m.name} (${m.email})\n`;
        if (m.tasks.length > 0) {
          dataContext += `  Open tasks:\n`;
          m.tasks.forEach((t, i) => {
            dataContext += `    ${i + 1}. "${t.title}" — Status: ${t.status}, Priority: ${t.priority}`;
            if (t.deadline) dataContext += `, Deadline: ${new Date(t.deadline).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
            if (t.project) dataContext += `, Project: ${t.project.name}`;
            dataContext += '\n';
          });
        } else {
          dataContext += `  No open tasks\n`;
        }
      });
    }

    // Add active project context
    if (activeProject) {
      const total = activeProject.tasks.length;
      const done = activeProject.tasks.filter(t => t.status === 'DONE').length;
      const inProgress = activeProject.tasks.filter(t => t.status === 'IN_PROGRESS').length;
      const todo = activeProject.tasks.filter(t => t.status === 'TODO').length;
      const members = activeProject.members.map(m => m.user?.name || 'Unknown').join(', ');

      dataContext += `\n=== ACTIVE PROJECT CONTEXT ===\n`;
      dataContext += `Project: "${activeProject.name}"\n`;
      dataContext += `Description: ${activeProject.description || 'None'}\n`;
      dataContext += `Team: ${members}\n`;
      dataContext += `Tasks — Total: ${total}, Done: ${done}, In Progress: ${inProgress}, To Do: ${todo}\n`;

      if (activeProject.tasks.length > 0) {
        dataContext += `All project tasks:\n`;
        activeProject.tasks.forEach((t, i) => {
          dataContext += `  ${i + 1}. ${formatTask(t)}\n`;
        });
      }
    }

    // Add user's own task summary
    const userTasks = await prisma.task.findMany({
      where: { assigneeId: userId },
      include: {
        project: { select: { name: true } }
      },
      orderBy: { updatedAt: 'desc' },
      take: 15
    });

    if (userTasks.length > 0) {
      const userDone = userTasks.filter(t => t.status === 'DONE').length;
      const userInProgress = userTasks.filter(t => t.status === 'IN_PROGRESS').length;
      const userTodo = userTasks.filter(t => t.status === 'TODO').length;
      const overdue = userTasks.filter(t => t.deadline && new Date(t.deadline) < new Date() && t.status !== 'DONE').length;

      dataContext += `\n=== CURRENT USER: ${user.name} ===\n`;
      dataContext += `Tasks assigned: ${userTasks.length} (Done: ${userDone}, In Progress: ${userInProgress}, To Do: ${userTodo}, Overdue: ${overdue})\n`;
      userTasks.forEach((t, i) => {
        dataContext += `  ${i + 1}. "${t.title}" — ${t.status}, ${t.priority}`;
        if (t.deadline) dataContext += `, Deadline: ${new Date(t.deadline).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
        if (t.project) dataContext += `, Project: ${t.project.name}`;
        dataContext += '\n';
      });
    }

    // Add user's projects list
    if (user.projectMembers.length > 0) {
      dataContext += `\n=== USER'S PROJECTS ===\n`;
      user.projectMembers.forEach(pm => {
        dataContext += `- ${pm.project.name} (Role: ${pm.role})\n`;
      });
    }

    // ──────────────────────────────────────────────
    // 5. BUILD SYSTEM + USER MESSAGES FOR GROQ
    // ──────────────────────────────────────────────

    // Safety trim: cap context at ~20k chars to stay within model limits
    const MAX_CONTEXT_CHARS = 20000;
    if (dataContext.length > MAX_CONTEXT_CHARS) {
      dataContext = dataContext.substring(0, MAX_CONTEXT_CHARS) + '\n... (data truncated for size)';
    }

    const systemPrompt = `You are the SmartOps AI Assistant, a database-aware project management assistant.

CRITICAL RULES:
1. You MUST answer ONLY using the DATABASE RECORDS provided below. These are REAL records from the system.
2. NEVER make up, guess, or assume any data. If information is not in the provided data, say "I don't have that information in the current data."
3. Use simple, natural sentences or short paragraphs. Do not use bullet points, numbered lists, tables, or markdown unless the user explicitly asks for them.
4. Be specific and refer directly to project or task names, statuses, deadlines, assignees, and priorities from the data.
5. Avoid long technical explanations and do not add extra motivational language.
6. When asked about deadlines, give the exact date in a human-readable format, for example "May 10, 2026."
7. When asked about assignees, give the exact name.
8. When asked about status, give the exact status (TODO, IN_PROGRESS, DONE).
9. When asked about workload, count tasks by status and priority from the data.
10. If the user asks something unrelated to project management, politely redirect them to project-related topics.

TODAY'S DATE: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

--- DATABASE RECORDS ---
${dataContext || 'No matching records found in the database.'}
--- END DATABASE RECORDS ---`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ];

    console.log('[ChatWithAI] Prompt size:', {
      systemChars: systemPrompt.length,
      dataContextChars: dataContext.length,
      userMessage: message.substring(0, 100)
    });

    try {
      // Call Groq with system + user message separation
      const aiResponse = await askGroqChat(messages, {
        temperature: 0.3,
        maxTokens: 1024
      });

      console.log('[ChatWithAI] DB-aware response generated successfully');

      return res.json({
        success: true,
        data: {
          message: aiResponse,
          timestamp: new Date().toISOString(),
          hasContext: !!projectId,
          searchResults: {
            tasksFound: matchedTasks.length,
            projectsFound: matchedProjects.length,
            membersFound: matchedMembers.length
          }
        }
      });

    } catch (aiError) {
      console.error('[ChatWithAI] Groq API error:', aiError.message);

      // DATA-DRIVEN fallback — answer directly from DB results, no generic templates
      let fallbackMessage = '';

      if (matchedTasks.length > 0) {
        const firstTasks = matchedTasks.slice(0, 3);
        fallbackMessage = `I found ${matchedTasks.length} matching task${matchedTasks.length === 1 ? '' : 's'} in the database. `;
        fallbackMessage += firstTasks.map((t) => {
          let sentence = `Task "${t.title}" is currently ${t.status.toLowerCase().replace(/_/g, ' ')}`;
          sentence += ` with ${t.priority.toLowerCase()} priority`;
          if (t.deadline) sentence += ` and a deadline on ${new Date(t.deadline).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
          if (t.project) sentence += ` for project ${t.project.name}`;
          if (t.assignee) sentence += ` assigned to ${t.assignee.name}`;
          return sentence + '.';
        }).join(' ');
        if (matchedTasks.length > 3) {
          fallbackMessage += ` There are ${matchedTasks.length - 3} additional matching tasks not listed here.`;
        }
      } else if (userTasks.length > 0) {
        fallbackMessage = `You currently have ${userTasks.length} tasks assigned. `;
        fallbackMessage += userTasks.slice(0, 3).map((t) => {
          let sentence = `Task "${t.title}" is ${t.status.toLowerCase().replace(/_/g, ' ')}`;
          sentence += ` with ${t.priority.toLowerCase()} priority`;
          if (t.deadline) sentence += ` and is due on ${new Date(t.deadline).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
          return sentence + '.';
        }).join(' ');
        if (userTasks.length > 3) {
          fallbackMessage += ` There are ${userTasks.length - 3} more tasks for you.`;
        }
      } else {
        fallbackMessage = 'No matching tasks or projects were found for your query. Try asking about specific task names, project names, or team members.';
      }

      return res.json({
        success: true,
        data: {
          message: fallbackMessage,
          timestamp: new Date().toISOString(),
          hasContext: !!projectId,
          warning: 'AI service unavailable — showing raw database results'
        }
      });
    }

  } catch (error) {
    console.error('[ChatWithAI] Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to process chat message',
      details: error.message
    });
  }
};

/**
 * F12 — NLP Task Creation
 * POST /api/ai/create-task
 *
 * Accepts a natural language message + projectId, extracts task fields via Groq,
 * resolves the assignee by name, validates project membership, creates a real
 * Prisma task record, emits Socket.IO events, and returns a rich success response.
 */
export const createTaskFromNLP = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { message, projectId } = req.body;

    // ── 1. Validate inputs ──────────────────────────────────────────────────
    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'message is required'
      });
    }

    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: 'projectId is required. Please select an active project first.'
      });
    }

    // ── 2. Validate project membership ──────────────────────────────────────
    let membership = null;
    try {
      const access = await requireProjectMember(projectId, req.user);
      membership = access.membership;
    } catch (accessError) {
      return sendAccessError(res, accessError);
    }

    // ── 3. Fetch project with members list for assignee matching ────────────
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } }
          }
        },
        owner: { select: { id: true, name: true, email: true } }
      }
    });

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    // Build full member list (owner + members)
    const allProjectMembers = [
      project.owner,
      ...project.members.map(m => m.user)
    ].filter(Boolean);

    console.log('[NLP Create Task] Project members:', allProjectMembers.map(m => m.name));

    // ── 4. Call Groq NLP extraction ─────────────────────────────────────────
    console.log('[NLP Create Task] Extracting from:', message);
    const extracted = await extractTaskFromNLP(message);
    console.log('[NLP Create Task] Extracted fields:', extracted);

    // ── 5. Resolve assignee by name (fuzzy match) ────────────────────────────
    let assigneeId = null;
    let resolvedAssignee = null;

    if (extracted.assigneeName) {
      const nameLower = extracted.assigneeName.toLowerCase();

      // Exact match first
      resolvedAssignee = allProjectMembers.find(
        m => m.name.toLowerCase() === nameLower
      );

      // Partial match (first name or last name)
      if (!resolvedAssignee) {
        resolvedAssignee = allProjectMembers.find(
          m =>
            m.name.toLowerCase().includes(nameLower) ||
            nameLower.includes(m.name.toLowerCase().split(' ')[0])
        );
      }

      if (resolvedAssignee) {
        assigneeId = resolvedAssignee.id;
        console.log('[NLP Create Task] Assignee resolved:', resolvedAssignee.name, '->', assigneeId);
      } else {
        console.warn('[NLP Create Task] Assignee not found in project:', extracted.assigneeName);
        // Don't fail — just create task without assignee and note it
      }
    }

    // ── 6. Check if current user can assign tasks ───────────────────────────
    const isGlobalAdmin = req.user.role === 'ADMIN';
    const isProjectAdmin = membership
      ? membership.role === 'ADMIN' || membership.role === 'OWNER'
      : true;
    const canAssign = isGlobalAdmin || isProjectAdmin;

    // If the user can't assign but tried to assign someone else, fallback to self
    if (assigneeId && assigneeId !== userId && !canAssign) {
      console.warn('[NLP Create Task] Non-admin tried to assign to another member. Falling back to self.');
      assigneeId = userId;
      resolvedAssignee = allProjectMembers.find(m => m.id === userId) || null;
    }

    // ── 7. Create the task in Prisma ─────────────────────────────────────────
    const taskData = {
      title: extracted.title,
      description: extracted.description || null,
      projectId,
      assigneeId: assigneeId || null,
      priority: extracted.priority,
      status: 'TODO',
      deadline: extracted.deadline ? new Date(extracted.deadline) : null,
    };

    console.log('[NLP Create Task] Creating task:', taskData);

    const task = await prisma.task.create({
      data: taskData,
      include: {
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
        project: { select: { id: true, name: true } },
        comments: false,
        files: false,
      }
    });

    console.log('[NLP Create Task] Prisma result:', { id: task.id, title: task.title });

    // ── 8. Emit Socket.IO events for real-time Kanban update ─────────────────
    emitToProject(projectId, 'task-created', task);
    emitToProject(projectId, 'board-updated', { projectId, action: 'task-created', task });

    // ── 9. Notify the assignee ───────────────────────────────────────────────
    if (assigneeId && assigneeId !== userId) {
      try {
        await createNotification(
          assigneeId,
          '🤖 AI Task Assigned to You',
          `"${task.title}" in project "${project.name}" was created by AI and assigned to you by ${req.user.name || 'a team member'}.`
        );
      } catch (notifErr) {
        console.warn('[NLP Create Task] Notification failed (non-critical):', notifErr.message);
      }
    }

    // ── 10. Build detailed success response ──────────────────────────────────
    const assigneeWarning = extracted.assigneeName && !resolvedAssignee
      ? `Could not find project member "${extracted.assigneeName}". Task created without assignee.`
      : null;

    return res.status(201).json({
      success: true,
      data: {
        task,
        extracted: {
          title: extracted.title,
          description: extracted.description,
          assigneeName: resolvedAssignee?.name || extracted.assigneeName || null,
          assigneeEmail: resolvedAssignee?.email || null,
          priority: extracted.priority,
          deadline: extracted.deadline,
          status: 'TODO',
          projectName: project.name,
        },
        message: `✅ Task "${task.title}" created successfully in ${project.name}`,
        warning: assigneeWarning,
      }
    });

  } catch (error) {
    console.error('[NLP Create Task] Unexpected error:', error.message, error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to create task from natural language',
      details: error.message
    });
  }
};

/**
 * F28 — Meeting Notes → Tasks AI (Part 1: Analyze)
 * POST /api/ai/meeting-notes/analyze
 */
export const analyzeMeetingNotes = async (req, res) => {
  try {
    const { projectId, notes } = req.body;
    const userId = req.user.id;

    if (!projectId || !notes || notes.trim().length < 10) {
      return res.status(400).json({ success: false, error: 'ProjectId and meeting notes (min 10 chars) are required' });
    }

    // 1. Validate membership
    let membership;
    try {
      const access = await requireProjectMember(projectId, req.user);
      membership = access.membership;
    } catch (err) {
      return sendAccessError(res, err);
    }

    // 2. Fetch project members for mapping
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } } },
        owner: { select: { id: true, name: true, email: true, avatarUrl: true } }
      }
    });

    const allMembers = [project.owner, ...project.members.map(m => m.user)].filter(Boolean);
    const memberNames = allMembers.map(m => m.name);

    // 3. Extract tasks via AI service
    const extraction = await extractTasksFromMeetingNotes(notes, memberNames);

    // 4. Intelligent mapping of assignees
    const tasksWithMembers = extraction.tasks.map(task => {
      let matchedId = null;
      let matchedName = null;

      if (task.assigneeName) {
        const search = task.assigneeName.toLowerCase();
        const found = allMembers.find(m => 
          m.name.toLowerCase() === search || 
          m.name.toLowerCase().includes(search) || 
          search.includes(m.name.toLowerCase().split(' ')[0])
        );
        
        if (found) {
          matchedId = found.id;
          matchedName = found.name;
        }
      }

      return {
        ...task,
        assigneeId: matchedId,
        resolvedAssigneeName: matchedName || task.assigneeName
      };
    });

    return res.json({
      success: true,
      data: {
        tasks: tasksWithMembers,
        summary: extraction.summary,
        totalExtracted: extraction.totalActionItems
      }
    });

  } catch (error) {
    console.error('[Meeting Analyze] Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to analyze meeting notes', details: error.message });
  }
};

/**
 * F28 — Meeting Notes → Tasks AI (Part 2: Bulk Create)
 * POST /api/ai/meeting-notes/create-tasks
 */
export const createMeetingTasks = async (req, res) => {
  try {
    const { projectId, tasks } = req.body;
    const userId = req.user.id;

    if (!projectId || !tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ success: false, error: 'ProjectId and tasks array are required' });
    }

    // 1. Validate membership
    try {
      await requireProjectMember(projectId, req.user);
    } catch (err) {
      return sendAccessError(res, err);
    }

    // 2. Bulk creation via Transaction
    const createdTasks = await prisma.$transaction(
      tasks.map(t => prisma.task.create({
        data: {
          title: t.title,
          description: t.description,
          projectId,
          assigneeId: t.assigneeId || null,
          priority: t.priority || 'MEDIUM',
          status: 'TODO',
          deadline: t.deadline ? new Date(t.deadline) : null,
        },
        include: {
          assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
          project: { select: { id: true, name: true } }
        }
      }))
    );

    // 3. Post-creation: Realtime & Notifications
    for (const task of createdTasks) {
      emitToProject(projectId, 'task-created', task);
      emitToProject(projectId, 'board-updated', { projectId, action: 'task-created', task });

      if (task.assigneeId && task.assigneeId !== userId) {
        try {
          await createNotification(
            task.assigneeId,
            '📅 New Meeting Action Item',
            `You have been assigned "${task.title}" from the recent meeting analysis.`
          );
        } catch (_) {}
      }
    }

    return res.status(201).json({
      success: true,
      data: {
        count: createdTasks.length,
        tasks: createdTasks
      },
      message: `Successfully created ${createdTasks.length} tasks from meeting notes.`
    });

  } catch (error) {
    console.error('[Meeting Create Tasks] Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to bulk create tasks', details: error.message });
  }
};
