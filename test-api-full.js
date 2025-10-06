const axios = require('axios');

(async () => {
  try {
    const ts = Date.now();
    console.log('Requesting FULL escort profiles...');
    const res = await axios.get(`http://localhost:5000/api/agents/escorts/active?full=true&cacheBust=${ts}`);
    console.log('Status:', res.status);
    console.log('Count:', res.data.length);
    if (res.data.length) {
      const p = res.data[0];
      console.log('Fields returned:', Object.keys(p));
      console.log('Description present?', !!p.description);
      console.log('Sample profile:', {
        username: p.username,
        firstName: p.firstName,
        description: p.description?.slice(0,80)
      });
    }
  } catch (e) {
    console.error('Error:', e.message, e.response?.data);
  }
})();