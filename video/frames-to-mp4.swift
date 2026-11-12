import AVFoundation
import CoreMedia
import CoreVideo
import Foundation
import ImageIO

@main
struct FramesToMP4 {
  static func main() async throws {
    guard CommandLine.arguments.count == 6 else {
      fatalError("Usage: frames-to-mp4.swift framesDir narration.wav output.mp4 fps seconds")
    }
    let framesDir = URL(fileURLWithPath: CommandLine.arguments[1])
    let audioURL = URL(fileURLWithPath: CommandLine.arguments[2])
    let outputURL = URL(fileURLWithPath: CommandLine.arguments[3])
    let fps = Int32(CommandLine.arguments[4])!
    let seconds = Int(CommandLine.arguments[5])!
    let frameCount = Int(fps) * seconds
    try? FileManager.default.removeItem(at: outputURL)

    let audioAsset = AVURLAsset(url: audioURL)
    guard let sourceAudio = try await audioAsset.loadTracks(withMediaType: .audio).first else {
      fatalError("The narration WAV has no audio track")
    }
    let audioReader = try AVAssetReader(asset: audioAsset)
    let audioOutput = AVAssetReaderTrackOutput(
      track: sourceAudio,
      outputSettings: [
        AVFormatIDKey: kAudioFormatLinearPCM,
        AVSampleRateKey: 48_000,
        AVNumberOfChannelsKey: 2,
        AVLinearPCMBitDepthKey: 16,
        AVLinearPCMIsFloatKey: false,
        AVLinearPCMIsBigEndianKey: false,
      ]
    )
    guard audioReader.canAdd(audioOutput) else { fatalError("Cannot decode narration WAV") }
    audioReader.add(audioOutput)

    let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)
    writer.shouldOptimizeForNetworkUse = true
    let videoInput = AVAssetWriterInput(
      mediaType: .video,
      outputSettings: [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: 1920,
        AVVideoHeightKey: 1080,
        AVVideoCompressionPropertiesKey: [
          AVVideoAverageBitRateKey: 8_000_000,
          AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        ],
      ]
    )
    videoInput.expectsMediaDataInRealTime = false
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: videoInput,
      sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: 1920,
        kCVPixelBufferHeightKey as String: 1080,
        kCVPixelBufferIOSurfacePropertiesKey as String: [:],
      ]
    )
    let audioInput = AVAssetWriterInput(
      mediaType: .audio,
      outputSettings: [
        AVFormatIDKey: kAudioFormatMPEG4AAC,
        AVSampleRateKey: 48_000,
        AVNumberOfChannelsKey: 2,
        AVEncoderBitRateKey: 192_000,
      ]
    )
    audioInput.expectsMediaDataInRealTime = false
    guard writer.canAdd(videoInput), writer.canAdd(audioInput) else {
      fatalError("Cannot create H.264/AAC MP4 tracks")
    }
    writer.add(videoInput)
    writer.add(audioInput)
    guard audioReader.startReading(), writer.startWriting() else {
      throw writer.error ?? audioReader.error ?? NSError(domain: "LicensePilot", code: 1)
    }
    writer.startSession(atSourceTime: .zero)

    let group = DispatchGroup()
    let videoQueue = DispatchQueue(label: "licensepilot.frames.encode")
    let audioQueue = DispatchQueue(label: "licensepilot.narration.encode")
    var encodedFrames = 0
    group.enter()
    videoInput.requestMediaDataWhenReady(on: videoQueue) {
      while videoInput.isReadyForMoreMediaData && encodedFrames < frameCount {
        let name = String(format: "%06d.png", encodedFrames + 1)
        let url = framesDir.appendingPathComponent(name) as CFURL
        guard let source = CGImageSourceCreateWithURL(url, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
        else {
          videoInput.markAsFinished()
          group.leave()
          return
        }
        var pixelBuffer: CVPixelBuffer?
        guard let pool = adaptor.pixelBufferPool,
          CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &pixelBuffer) == kCVReturnSuccess,
          let buffer = pixelBuffer,
          CVPixelBufferLockBaseAddress(buffer, []) == kCVReturnSuccess
        else {
          videoInput.markAsFinished()
          group.leave()
          return
        }
        if let base = CVPixelBufferGetBaseAddress(buffer),
          let context = CGContext(
            data: base,
            width: 1920,
            height: 1080,
            bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.premultipliedFirst.rawValue
          )
        {
          context.draw(image, in: CGRect(x: 0, y: 0, width: 1920, height: 1080))
        }
        CVPixelBufferUnlockBaseAddress(buffer, [])
        let time = CMTime(value: Int64(encodedFrames), timescale: fps)
        if !adaptor.append(buffer, withPresentationTime: time) {
          videoInput.markAsFinished()
          group.leave()
          return
        }
        encodedFrames += 1
      }
      if encodedFrames == frameCount {
        videoInput.markAsFinished()
        group.leave()
      }
    }

    group.enter()
    audioInput.requestMediaDataWhenReady(on: audioQueue) {
      while audioInput.isReadyForMoreMediaData {
        guard let sample = audioOutput.copyNextSampleBuffer() else {
          audioInput.markAsFinished()
          group.leave()
          return
        }
        if !audioInput.append(sample) {
          audioInput.markAsFinished()
          group.leave()
          return
        }
      }
    }
    group.wait()
    let finished = DispatchSemaphore(value: 0)
    writer.finishWriting { finished.signal() }
    finished.wait()
    guard writer.status == .completed else { throw writer.error ?? NSError(domain: "LicensePilot", code: 2) }
    guard encodedFrames == frameCount else {
      fatalError("Expected \(frameCount) screen frames, encoded \(encodedFrames)")
    }
    print("frames=\(encodedFrames) fps=\(fps) duration=\(Double(encodedFrames) / Double(fps)) seconds")
  }
}
