

for(var i = 0; i < 4; i++)
  console.log(Buffer.from([(i)]).toString('base64'))
for(var i = 0; i < 16; i++)
  console.log(Buffer.from([0, 0|(i)]).toString('base64'))


