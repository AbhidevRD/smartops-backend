export const taskPrioritySuggestion = async(req,res)=>{
  const { title } = req.body;

  let priority = 'MEDIUM';

  if(title.toLowerCase().includes('urgent')){
    priority = 'HIGH';
  }

  res.json({
    suggestedPriority: priority
  });
};