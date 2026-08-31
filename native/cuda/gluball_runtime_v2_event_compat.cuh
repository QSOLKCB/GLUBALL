// SPDX-License-Identifier: MPL-2.0
#pragma once

#include <cuda_runtime.h>

namespace gluball_cuda_v2_event_compat {

// Runtime V2 records kernel timing events both during ordinary launches and
// while constructing a CUDA Graph. During stream capture, an external event
// record node is required so replay updates the event handle with timestamp
// state that remains valid for cudaEventElapsedTime(). Outside capture, retain
// the ordinary default event-record semantics.
inline cudaError_t record_timing_event(cudaEvent_t event, cudaStream_t stream) {
  cudaStreamCaptureStatus capture_status = cudaStreamCaptureStatusNone;
  const cudaError_t capture_query = cudaStreamIsCapturing(stream, &capture_status);
  if (capture_query != cudaSuccess) return capture_query;

  const unsigned int flags = capture_status == cudaStreamCaptureStatusActive
      ? cudaEventRecordExternal
      : cudaEventRecordDefault;
  return cudaEventRecordWithFlags(event, stream, flags);
}

}  // namespace gluball_cuda_v2_event_compat

// cuda_runtime.h is included above before this macro is defined, so CUDA's
// declarations remain untouched. The target-local NVCC pre-include causes
// Runtime V2's two timing-event records to pass through the capture-aware shim.
#define cudaEventRecord(event, stream) \
  ::gluball_cuda_v2_event_compat::record_timing_event((event), (stream))
