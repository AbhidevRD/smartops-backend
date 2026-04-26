import axios from 'axios';
import cron from 'node-cron';

cron.schedule('0 9 * * *', async ()=> {
  console.log('Daily standup job started');
});

export async function askGroq(prompt) {
  try {
    const res = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama3-8b-8192',
        messages: [
          { role: 'user', content: prompt }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.data.choices[0].message.content;

  } catch (error) {
    return 'AI unavailable';
  }
}