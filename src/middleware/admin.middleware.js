export default function adminOnly(req,res,next){
  if(req.user.role !== 'ADMIN'){
    return res.status(403).json({
      error:'Admin only access'
    });
  }

  next();
}