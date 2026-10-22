// The person matte helper for `mm footage matte`: the macOS Vision framework segments the people in every
// frame of a sequence on the device (no network, no model download). For each f*.jpg in <in-dir> it
// writes a grey PNG of the same name and size into <out-dir>: white where a person is, black elsewhere.
// Usage: segment <in-dir> <out-dir> <accurate|balanced>. Compiled by scripts/footage-matte.mjs with swiftc
// into the piece's out/ on first use (macOS 12 or later). Exit 0 written, 1 a frame failed, 2 usage.
import CoreImage
import Foundation
import ImageIO
import UniformTypeIdentifiers
import Vision

func fail(_ message: String, _ code: Int32) -> Never {
  FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
  exit(code)
}

let args = CommandLine.arguments
guard args.count == 4, ["accurate", "balanced"].contains(args[3]) else { fail("usage: segment <in-dir> <out-dir> <accurate|balanced>", 2) }
let inDir = URL(fileURLWithPath: args[1]), outDir = URL(fileURLWithPath: args[2])
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
guard let listed = try? FileManager.default.contentsOfDirectory(atPath: inDir.path) else { fail("cannot read \(inDir.path)", 2) }
let names = listed.filter { $0.hasPrefix("f") && $0.hasSuffix(".jpg") }.sorted()
if names.isEmpty { fail("no f*.jpg frames in \(inDir.path)", 2) }

let request = VNGeneratePersonSegmentationRequest()
request.qualityLevel = args[3] == "accurate" ? .accurate : .balanced
request.outputPixelFormat = kCVPixelFormatType_OneComponent8
// one context, software rendering: the scaling step then gives the same bytes on every run
let context = CIContext(options: [.useSoftwareRenderer: true])
let grey = CGColorSpaceCreateDeviceGray()

for name in names {
  let src = inDir.appendingPathComponent(name)
  guard let source = CGImageSourceCreateWithURL(src as CFURL, nil), let frame = CGImageSourceCreateImageAtIndex(source, 0, nil) else { fail("cannot decode \(name)", 1) }
  do { try VNImageRequestHandler(cgImage: frame, options: [:]).perform([request]) } catch { fail("Vision failed on \(name): \(error)", 1) }
  guard let mask = request.results?.first?.pixelBuffer else { fail("Vision returned no mask for \(name)", 1) }
  // the mask comes at the model's own size: stretch it over the frame
  var image = CIImage(cvPixelBuffer: mask)
  image = image.transformed(by: CGAffineTransform(scaleX: CGFloat(frame.width) / image.extent.width, y: CGFloat(frame.height) / image.extent.height))
  let box = CGRect(x: 0, y: 0, width: frame.width, height: frame.height)
  guard let out = context.createCGImage(image, from: box, format: .L8, colorSpace: grey) else { fail("cannot draw the mask of \(name)", 1) }
  let file = outDir.appendingPathComponent(String(name.dropLast(4)) + ".png")
  guard let dest = CGImageDestinationCreateWithURL(file as CFURL, UTType.png.identifier as CFString, 1, nil) else { fail("cannot write \(file.path)", 1) }
  CGImageDestinationAddImage(dest, out, nil)
  if !CGImageDestinationFinalize(dest) { fail("cannot write \(file.path)", 1) }
}
print("segmented \(names.count) frames")
