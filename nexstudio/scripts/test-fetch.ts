import "dotenv/config";

async function run() {
  const videoUrl = "https://heygen-product.s3.amazonaws.com/hyperframe/output/8f4816f3-6df1-489a-bf9d-41a7fd967c9c/video.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIA3FLD4S3AUVE3T26R%2F20260715%2Fus-east-2%2Fs3%2Faws4_request&X-Amz-Date=20260715T055713Z&X-Amz-Expires=604800&X-Amz-SignedHeaders=host&X-Amz-Signature=1a58b5897ddcf576c1095e1d0bb6e009e77d449109b8d160d1d5999ef2eb0bab";
  
  console.log("Fetching video...");
  const res1 = await fetch(videoUrl, { method: "GET" });
  console.log(`Video status: ${res1.status}`);
  const text = await res1.text().catch(() => "");
  console.log(`Response start: ${text.slice(0, 500)}`);
}

run().catch(console.error);
