# Portrait geometry model

Google MediaPipe Face Detection, short-range TensorFlow.js model, version 1.
Apache License 2.0; license included alongside the weights.

Source: https://www.kaggle.com/models/mediapipe/face-detection/tfJs/short/1
API download: https://www.kaggle.com/api/v1/models/mediapipe/face-detection/tfJs/short/1/download/
Runtime implementation: https://github.com/tensorflow/tfjs-models/tree/master/face-detection

Bundled on 2026-10-02; no runtime model downloads or external photo-analysis calls.
The model estimates a face bounding box, not identity. Geometry is stored once with
the photo; the UI uses it to frame the portrait, with an upper-image fallback.

SHA-256:

- model.json: `c131145fade749f714d39811f282e973760a69cb9e1a9c22f91e132bd8dcd396`
- group1-shard1of1.bin: `e9b69ee1c1f8cd33c58120bcd75bf8c56bfba20c880f447e9d293ec102059d4b`
