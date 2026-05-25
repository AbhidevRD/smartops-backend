import prisma from '../lib/prisma.js';

function buildSummary(project) {
  const total = project.tasks.length;
  const completed = project.tasks.filter(t => t.status === 'DONE').length;
  const inProgress = project.tasks.filter(t => t.status === 'IN_PROGRESS').length;
  const todo = project.tasks.filter(t => t.status === 'TODO').length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    total,
    completed,
    inProgress,
    todo,
    completionRate
  };
}

function csvValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function reportToCsv(report) {
  const lines = [
    ['Project', report.projectName],
    ['Generated At', report.generatedAt],
    ['Total Tasks', report.totalTasks],
    ['Completed', report.completed],
    ['In Progress', report.inProgress],
    ['Todo', report.todo],
    ['Completion Rate', `${report.completionRate}%`],
    ['Members', report.memberCount],
    [],
    ['Tasks'],
    ['Title', 'Status', 'Priority', 'Assignee', 'Deadline', 'Created At', 'Completed At']
  ];

  for (const task of report.tasks) {
    lines.push([
      task.title,
      task.status,
      task.priority,
      task.assignee?.name || task.assignee?.email || '',
      task.deadline || '',
      task.createdAt || '',
      task.completedAt || ''
    ]);
  }

  return lines.map(row => row.map(csvValue).join(',')).join('\n');
}

async function getProjectReportForUser(projectId, userId) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      members: {
        some: { userId }
      }
    },
    include: {
      owner: {
        select: { id: true, name: true, email: true }
      },
      tasks: {
        orderBy: { createdAt: 'desc' },
        include: {
          assignee: { select: { id: true, name: true, email: true } }
        }
      },
      members: {
        include: {
          user: { select: { id: true, name: true, email: true } }
        }
      }
    }
  });

  if (!project) {
    return null;
  }

  const stats = buildSummary(project);
  const byPriority = {
    HIGH: project.tasks.filter(t => t.priority === 'HIGH').length,
    MEDIUM: project.tasks.filter(t => t.priority === 'MEDIUM').length,
    LOW: project.tasks.filter(t => t.priority === 'LOW').length
  };

  return {
    id: project.id,
    projectId: project.id,
    name: project.name,
    projectName: project.name,
    description: project.description,
    owner: project.owner,
    type: 'Project',
    status: stats.completionRate === 100 ? 'completed' : 'pending',
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    generatedAt: new Date().toISOString(),
    totalTasks: stats.total,
    completed: stats.completed,
    inProgress: stats.inProgress,
    todo: stats.todo,
    completionRate: stats.completionRate,
    stats,
    byPriority,
    memberCount: project.members.length,
    members: project.members.map(m => ({
      id: m.id,
      role: m.role,
      user: m.user
    })),
    tasks: project.tasks
  };
}

// GET /api/reports - list summary reports for all projects the user is part of
export const listReports = async (req, res) => {
  try {
    const userId = req.user.id;

    const projects = await prisma.project.findMany({
      where: {
        members: { some: { userId } }
      },
      include: {
        tasks: true,
        members: true
      },
      orderBy: { updatedAt: 'desc' }
    });

    const reports = projects.map(project => {
      const stats = buildSummary(project);

      return {
        id: project.id,
        projectId: project.id,
        name: project.name,
        projectName: project.name,
        type: 'Project',
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        status: stats.completionRate === 100 ? 'completed' : 'pending',
        stats,
        memberCount: project.members.length
      };
    });

    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/reports/project/:id - detailed report for a specific project
export const projectReport = async (req, res) => {
  try {
    const report = await getProjectReportForUser(req.params.id, req.user.id);

    if (!report) {
      return res.status(404).json({ error: 'Project report not found' });
    }

    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/reports/project/:id/download?format=csv|json
export const downloadProjectReport = async (req, res) => {
  try {
    const report = await getProjectReportForUser(req.params.id, req.user.id);

    if (!report) {
      return res.status(404).json({ error: 'Project report not found' });
    }

    const requestedFormat = String(req.query.format || 'csv').toLowerCase();
    const format = requestedFormat === 'json' ? 'json' : 'csv';
    const safeName = report.projectName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'project-report';
    const filename = `${safeName}-report.${format}`;

    // Set proper headers for file download
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (format === 'json') {
      res.type('application/json').send(JSON.stringify(report, null, 2));
      return;
    }

    res.type('text/csv; charset=utf-8').send(reportToCsv(report));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/reports/generate - generate and return a report on demand
export const generateReport = async (req, res) => {
  try {
    const { projectId, type = 'summary' } = req.body;
    const userId = req.user.id;

    if (projectId) {
      const report = await getProjectReportForUser(projectId, userId);

      if (!report) {
        return res.status(404).json({ error: 'Project report not found' });
      }

      return res.json(report);
    }

    const projects = await prisma.project.findMany({
      where: { members: { some: { userId } } },
      include: { tasks: true }
    });

    const totalProjects = projects.length;
    const totalTasks = projects.reduce((sum, project) => sum + project.tasks.length, 0);
    const completedTasks = projects.reduce(
      (sum, project) => sum + project.tasks.filter(task => task.status === 'DONE').length,
      0
    );

    res.json({
      id: `workspace-${Date.now()}`,
      type,
      generatedAt: new Date().toISOString(),
      totalProjects,
      totalTasks,
      completedTasks,
      pendingTasks: totalTasks - completedTasks,
      completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
