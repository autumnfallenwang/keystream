import Foundation
import Vision
import AppKit

struct OCRLine: Codable {
    let text: String
    let confidence: Float
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

struct OCRResult: Codable {
    let lines: [OCRLine]
    let joined: String
}

func die(_ msg: String) -> Never {
    FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
    exit(1)
}

guard CommandLine.arguments.count >= 2 else {
    die("usage: ocr_helper <image_path>")
}
let path = CommandLine.arguments[1]

guard let image = NSImage(contentsOfFile: path),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    die("could not load image: \(path)")
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
request.revision = VNRecognizeTextRequestRevision3

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
    try handler.perform([request])
} catch {
    die("OCR failed: \(error)")
}

let observations = request.results ?? []
var lines: [OCRLine] = []
for obs in observations {
    guard let top = obs.topCandidates(1).first else { continue }
    let bb = obs.boundingBox
    lines.append(OCRLine(
        text: top.string,
        confidence: top.confidence,
        x: Double(bb.origin.x),
        y: Double(bb.origin.y),
        width: Double(bb.size.width),
        height: Double(bb.size.height)
    ))
}

let result = OCRResult(lines: lines, joined: lines.map { $0.text }.joined(separator: "\n"))
let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted]
let data = try encoder.encode(result)
FileHandle.standardOutput.write(data)
FileHandle.standardOutput.write("\n".data(using: .utf8)!)
