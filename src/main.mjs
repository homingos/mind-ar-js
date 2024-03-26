import * as  functions from '@google-cloud/functions-framework';
import * as https from 'https';
import { OfflineCompiler } from './image-target/offline-compiler.js';
import { Storage } from '@google-cloud/storage';
import axios from 'axios';
import { loadImage } from 'canvas';


async function uploadToGCS(file_location, bucket_name, upload_prefix, final_output_name) {
  return new Promise(async (resolve, reject) => {
    const storage = new Storage();
    const bucket = storage.bucket(bucket_name);

    try {
      const destinationPath = `${upload_prefix}.${final_output_name}`

      await bucket.upload(file_location, {
        destination: destinationPath,
      });

      const fileUploadedUrl = `https://storage.googleapis.com/${bucket_name}/${destinationPath}`;
      resolve(fileUploadedUrl);
    } catch (err) {
      console.error('Error uploading image to GCS:', err);
      reject(err);
    }
  })
}


functions.http('helloHttp', async (req, res) => {
  let imgUrl = req.query.img;
  let objectId = req.query.id;
  let env = req.query.env;
  // Validate query parameters
  if (!imgUrl) {
    return res.status(400).send("Missing img  query parameters");
  }

  https.get(imgUrl, (response) => {
    const chunks = [];

    response.on('data', (chunk) => {
      chunks.push(chunk);
    });

    response.on('end', async () => {
      try {
        const buffer = Buffer.concat(chunks);
        const compiler = new OfflineCompiler();
        const images = await loadImage(buffer)
        await compiler.compileImageTargets([images], console.log);
        const featureBuffer = compiler.exportData();


        if (objectId) {
          const filename = `${objectId}.mind`;
          const bucketName = "zingcam";
          const uploadPrefix = `flam/${env}/mindfile/`;
          const mindFileUrl = await uploadToGCS(featureBuffer, bucketName, uploadPrefix, filename);
          console.log(mindFileUrl);
          let postbackPayload = {
            "instant_id": object_id,
            "mind_url": mindFileUrl
          }
          let update_postback_url = env == "prod" ?
            "https://zingcam.prod.flamapp.com/zingcam/instant/update/post-back" : env == "stage" ?
              "https://zingcam.stage.flamapp.com/zingcam/instant/update/post-back"
              : "https://zingcam.dev.flamapp.com/zingcam/instant/update/post-back"

          try {
            axios.put(update_postback_url, postbackPayload)
          } catch (error) {
            console.log(error)
          }

          res.status(200).send("ok");
        } else {
          const filename = `target.mind`;
          res.set('Content-Disposition', `attachment; filename="${filename}"`);
          res.set('Content-Length', featureBuffer.length);
          res.send(featureBuffer);
        }
      } catch (err) {
        console.error('Error processing image:', err);
        res.status(500).send('Error processing image');
      }
    });
  }).on('error', (err) => {
    console.error('Error fetching image:', err);
    res.status(500).send('Error fetching image');
  });
});
