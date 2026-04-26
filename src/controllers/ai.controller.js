import prisma from '../lib/prisma.js';
import { askGroq } from '../services/ai.service.js';

export const parseTask = async (req, res) => {
  try {
    const { text } = req.body;

    const prompt = `
Convert this into JSON:
"${text}"

Return only:
{
 "title":"",
 "assignee":"",
 "dueDate":"",
 "priority":"LOW/MEDIUM/HIGH"
}
`;

    const ai = await askGroq(prompt);

    res.json({
      success: true,
      parsed: ai
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
};

export const prioritizeTask = async (req, res) => {
  try {
    const { title, dueDays, workload } = req.body;

    let score = 0;

    if (dueDays <= 1) score += 5;
    else if (dueDays <= 3) score += 3;

    if (workload > 5) score += 2;

    if (title.toLowerCase().includes('bug')) score += 3;
    if (title.toLowerCase().includes('urgent')) score += 5;

    let priority = 'LOW';

    if (score >= 8) priority = 'HIGH';
    else if (score >= 4) priority = 'MEDIUM';

    res.json({
      priority,
      score
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
};

export const generateStandup = async(req,res)=>{
  try{
    const userId = req.user.id;

    const tasks = await prisma.task.findMany({
      where:{
        assigneeId:userId
      }
    });

    const prompt = `
Create a short daily standup report for these tasks:
${JSON.stringify(tasks)}

Format:
Yesterday:
Today:
Blockers:
`;

    const report = await askGroq(prompt);

    res.json({ report });

  }catch(error){
    res.status(500).json({
      error:error.message
    });
  }
};
export const riskPredictor = async (req, res) => {
  try {
    const { taskId } = req.params;

    const task = await prisma.task.findUnique({
      where: { id: taskId }
    });

    if (!task) {
      return res.status(404).json({
        error: 'Task not found'
      });
    }

    let risk = 10;

    if (task.status !== 'DONE') {
      risk += 25;
    }

    if (task.deadline) {
      const now = new Date();

      const daysLeft = Math.ceil(
        (new Date(task.deadline) - now) /
        (1000 * 60 * 60 * 24)
      );

      if (daysLeft <= 1) risk += 45;
      else if (daysLeft <= 3) risk += 30;
      else if (daysLeft <= 7) risk += 15;
    }

    if (task.priority === 'HIGH') {
      risk += 15;
    }

    if (risk > 100) risk = 100;

    res.json({
      taskId: task.id,
      title: task.title,
      missProbability: risk + '%'
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
};
export const velocityForecast = async (req, res) => {
  try {
    const { projectId } = req.params;

    const tasks = await prisma.task.findMany({
      where: { projectId }
    });

    const total = tasks.length;

    const completed = tasks.filter(
      task => task.status === 'DONE'
    ).length;

    const pending = total - completed;

    let weeklyVelocity = 5;

    if (completed >= 10) {
      weeklyVelocity = 8;
    }

    const weeksLeft = Math.ceil(
      pending / weeklyVelocity
    );

    const finishDate = new Date();

    finishDate.setDate(
      finishDate.getDate() + (weeksLeft * 7)
    );

    res.json({
      totalTasks: total,
      completed,
      pending,
      weeklyVelocity,
      predictedFinishDate:
        finishDate.toDateString()
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
};
export const bottleneckDetector = async (req, res) => {
  try {
    const tasks = await prisma.task.findMany();

    const blockedTasks = tasks.filter(task =>
      task.status !== 'DONE' &&
      task.priority === 'HIGH'
    );

    const workload = {};

    tasks.forEach(task => {
      const user =
        task.assigneeId || 'unassigned';

      workload[user] =
        (workload[user] || 0) + 1;
    });

    let overloadedUser = null;
    let maxTasks = 0;

    for (const user in workload) {
      if (workload[user] > maxTasks) {
        maxTasks = workload[user];
        overloadedUser = user;
      }
    }

    res.json({
      blockedHighPriorityTasks:
        blockedTasks.length,

      overloadedUser,

      assignedTasks: maxTasks
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
};
export const burnoutRadar = async (req, res) => {
  try {

    const users = await prisma.user.findMany({
      include: {
        assignedTasks: true
      }
    });

    const results = users.map(user => {

      const tasks = user.assignedTasks || [];

      const openTasks = tasks.filter(
        t => t.status !== 'DONE'
      ).length;

      const highPriority = tasks.filter(
        t =>
          t.status !== 'DONE' &&
          t.priority === 'HIGH'
      ).length;

      const overdue = tasks.filter(t =>
        t.deadline &&
        new Date(t.deadline) < new Date() &&
        t.status !== 'DONE'
      ).length;

      let score = 0;

      score += openTasks * 5;
      score += highPriority * 10;
      score += overdue * 15;

      let level = 'LOW';

      if (score >= 60) level = 'HIGH';
      else if (score >= 30) level = 'MEDIUM';

      return {
        userId: user.id,
        name: user.name,
        burnoutScore: score,
        riskLevel: level
      };
    });

    res.json(results);

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
};
export const sentimentTracker = async (req, res) => {
  try {

    const comments =
      await prisma.taskComment.findMany();

    const positiveWords = [
      'good','great','done',
      'nice','happy','success'
    ];

    const negativeWords = [
      'delay','bad','stuck',
      'issue','problem','late'
    ];

    let score = 50;

    comments.forEach(comment => {

      const text =
        comment.message.toLowerCase();

      positiveWords.forEach(word => {
        if(text.includes(word)) score += 2;
      });

      negativeWords.forEach(word => {
        if(text.includes(word)) score -= 2;
      });

    });

    
    if(score > 100) score = 100;
    if(score < 0) score = 0;

    let mood = 'Neutral';

    if(score >= 70) mood = 'Positive';
    else if(score <= 35) mood = 'Negative';

    res.json({
      moraleScore: score,
      mood,
      totalComments: comments.length
    });

  } catch(error){
    res.status(500).json({
      error:error.message
    });
  }
};

export const startPomodoro = async (req, res) => {
  try {
    const userId = req.user.id;

    const { taskId, minutes } = req.body;

    const session =
      await prisma.focusSession.create({
        data: {
          userId,
          taskId,
          minutes: minutes || 25
        }
      });

    res.json({
      success: true,
      message: 'Focus session logged',
      session
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
};

export const focusStats = async (req,res)=>{
  try{

    const userId = req.user.id;

    const sessions =
      await prisma.focusSession.findMany({
        where:{ userId }
      });

    const totalMinutes =
      sessions.reduce(
        (sum,s)=>sum+s.minutes,
        0
      );

    res.json({
      totalSessions:sessions.length,
      totalMinutes,
      totalHours:
        (totalMinutes/60).toFixed(1)
    });

  }catch(error){
    res.status(500).json({
      error:error.message
    });
  }
};

export const awardBadges = async (req,res)=>{
  try{

    const users =
      await prisma.user.findMany();

    for(const user of users){

      if(user.xpPoints >= 100){

        const exists =
          await prisma.badge.findFirst({
            where:{
              userId:user.id,
              name:'Sprint Champion'
            }
          });

        if(!exists){
          await prisma.badge.create({
            data:{
              userId:user.id,
              name:'Sprint Champion'
            }
          });
        }
      }
    }

    res.json({
      success:true,
      message:'Badges checked'
    });

  }catch(error){
    res.status(500).json({
      error:error.message
    });
  }
};

export const leaderboard = async (req,res)=>{
  try{

    const users =
      await prisma.user.findMany({
        orderBy:{
          xpPoints:'desc'
        },
        take:10,
        select:{
          name:true,
          xpPoints:true
        }
      });

    res.json(users);

  }catch(error){
    res.status(500).json({
      error:error.message
    });
  }
};

export const dependencyGraph = async (req,res)=>{
  try{

    const { projectId } = req.params;

    const tasks =
      await prisma.task.findMany({
        where:{ projectId },
        orderBy:{ createdAt:'asc' }
      });

    const links = [];

    for(let i=1;i<tasks.length;i++){

      const current = tasks[i];
      const previous = tasks[i-1];

      if(
        current.title.toLowerCase().includes('deploy') ||
        current.title.toLowerCase().includes('test') ||
        current.title.toLowerCase().includes('release')
      ){
        links.push({
          from: previous.id,
          to: current.id
        });
      }
    }

    res.json({
      nodes: tasks.map(task=>({
        id: task.id,
        label: task.title,
        status: task.status
      })),
      links
    });

  }catch(error){
    res.status(500).json({
      error:error.message
    });
  }
};

export const sprintPlanner = async (req,res)=>{
  try{

    const {
      projectId,
      capacityHours
    } = req.body;

    const tasks =
      await prisma.task.findMany({
        where:{
          projectId,
          status:{
            not:'DONE'
          }
        },
        orderBy:{
          priority:'desc'
        }
      });

    let used = 0;
    const sprint = [];

    for(const task of tasks){

      const hours =
        task.estimatedHours || 2;

      if(used + hours <= capacityHours){

        sprint.push({
          id: task.id,
          title: task.title,
          hours
        });

        used += hours;
      }
    }

    res.json({
      selectedTasks:sprint,
      usedHours:used,
      remainingHours:
        capacityHours - used
    });

  }catch(error){
    res.status(500).json({
      error:error.message
    });
  }
};