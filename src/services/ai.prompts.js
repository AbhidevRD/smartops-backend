/**
 * Prompt templates for AI features
 * Each function builds a structured prompt requesting JSON responses
 */

export function buildParseTaskPrompt(text) {
  return `Extract task information from this text and return ONLY valid JSON:

Text: "${text}"

Return this exact JSON format:
{
  "title": "task name",
  "assignee": "name or null",
  "dueDate": "YYYY-MM-DD or null",
  "priority": "LOW|MEDIUM|HIGH",
  "description": "brief description"
}

JSON:`;
}

export function buildPrioritizePrompt(title, dueDays, workload) {
  return `Analyze this task and assign a priority level.

Task: "${title}"
Days until due: ${dueDays}
Current workload: ${workload} items

Return ONLY valid JSON:
{
  "priority": "LOW|MEDIUM|HIGH",
  "reasoning": "brief reason",
  "urgencyScore": 1-10
}

JSON:`;
}

export function buildStandupPrompt(tasks) {
  return `Generate a professional daily standup report from these tasks:

${JSON.stringify(tasks, null, 2)}

Return ONLY valid JSON:
{
  "yesterday": "what was completed",
  "today": "what's planned",
  "blockers": "any blockers or empty string"
}

JSON:`;
}

export function buildRiskPrompt(task) {
  return `Analyze task risk and predict probability of missing deadline:

Task: ${task.title}
Status: ${task.status}
Priority: ${task.priority}
Due: ${task.deadline || 'no deadline'}
Days remaining: ${task.daysRemaining || 'unknown'}

Return ONLY valid JSON:
{
  "riskLevel": "LOW|MEDIUM|HIGH",
  "missProbability": "percentage as number 0-100",
  "recommendations": "array of 1-2 action items"
}

JSON:`;
}

export function buildVelocityPrompt(projectName, completed, pending, weeklyRate) {
  return `Forecast project completion timeline:

Project: ${projectName}
Completed tasks: ${completed}
Pending tasks: ${pending}
Average weekly velocity: ${weeklyRate} tasks/week

Return ONLY valid JSON:
{
  "weeksRemaining": "estimated weeks",
  "predictedFinishDate": "YYYY-MM-DD",
  "confidence": "LOW|MEDIUM|HIGH",
  "recommendation": "brief note"
}

JSON:`;
}

export function buildNotesPrompt(notes) {
  return `Extract actionable task items from these meeting notes:

Notes:
${notes}

Return ONLY a valid JSON array:
[
  {
    "title": "action item",
    "priority": "LOW|MEDIUM|HIGH",
    "owner": "responsible person or null"
  }
]

JSON:`;
}

export function buildVoiceCommandPrompt(command) {
  return `Convert this voice command into a structured task:

Command: "${command}"

Return ONLY valid JSON:
{
  "title": "clear task name",
  "priority": "LOW|MEDIUM|HIGH",
  "action": "create|update|search|etc"
}

JSON:`;
}

export function buildSentimentPrompt(comments) {
  return `Analyze team sentiment from these comments:

${comments.map(c => `- ${c}`).join('\n')}

Return ONLY valid JSON:
{
  "overallMood": "positive|neutral|negative",
  "score": "0-100",
  "concerns": "array of identified issues or empty",
  "highlights": "array of positive points or empty"
}

JSON:`;
}

export function buildBottleneckPrompt(taskData) {
  return `Identify project bottlenecks and blockers:

${JSON.stringify(taskData, null, 2)}

Return ONLY valid JSON:
{
  "mainBottleneck": "description",
  "affectedCount": "number of tasks",
  "suggestedAction": "recommendation",
  "priority": "HIGH|MEDIUM|LOW"
}

JSON:`;
}

export function buildBurnoutPrompt(userData) {
  return `Assess team member burnout risk:

${JSON.stringify(userData, null, 2)}

Return ONLY valid JSON:
{
  "riskLevel": "LOW|MEDIUM|HIGH",
  "score": "0-100",
  "factors": "array of contributing factors",
  "recommendations": "array of actions to reduce burnout"
}

JSON:`;
}

export function buildDependencyGraphPrompt(tasks) {
  return `Build a task dependency graph from these tasks:

${JSON.stringify(tasks, null, 2)}

Return ONLY valid JSON:
{
  "dependencies": [
    { "from": "taskId", "to": "taskId", "type": "blocks|requires|relates" }
  ],
  "criticalPath": ["taskId1", "taskId2"],
  "summary": "brief analysis"
}

JSON:`;
}

export function buildSprintPlanPrompt(tasks, capacity) {
  return `Plan sprint allocation for these tasks with capacity constraint:

Capacity: ${capacity} hours
Tasks:
${JSON.stringify(tasks, null, 2)}

Return ONLY valid JSON:
{
  "sprintTasks": [
    { "id": "taskId", "title": "name", "estimatedHours": "number" }
  ],
  "totalHours": "number",
  "remainingCapacity": "number",
  "note": "brief planning note"
}

JSON:`;
}

export function buildBottleneckDetectorPrompt(tasks, users) {
  return `Identify current project bottlenecks and overloaded team members:

Total tasks: ${tasks.length}
Team members: ${users.length}
${JSON.stringify({ tasks: tasks.slice(0, 10), users }, null, 2)}

Return ONLY valid JSON:
{
  "bottlenecks": [
    { "type": "person|task|process", "description": "what's blocked", "impact": "number" }
  ],
  "overloadedMembers": ["userId1", "userId2"],
  "recommendation": "immediate action suggestion"
}

JSON:`;
}

// Alias for backward compatibility
export function buildBotleneckDetectorPrompt(tasks, users) {
  return buildBottleneckDetectorPrompt(tasks, users);
}
