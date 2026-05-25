import { verifyAuthToken } from '../utils/authToken.js';

export default async function auth(req,res,next){
  try{
    const header = req.headers.authorization;

    if(!header){
      return res.status(401).json({ error:'No token' });
    }

    const token = header.split(' ')[1];

    req.user = await verifyAuthToken(token);

    next();

  }catch(error){
    return res.status(401).json({
      error:error.message || 'Invalid token'
    });
  }
}
