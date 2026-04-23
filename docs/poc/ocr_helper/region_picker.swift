import Cocoa

// Full-screen transparent overlay window. User drags a rectangle.
// Prints "x y width height" to stdout on completion, exits.

class PickerView: NSView {
    var startPoint: NSPoint?
    var currentRect: NSRect = .zero
    var onDone: ((NSRect) -> Void)?

    override func draw(_ dirtyRect: NSRect) {
        NSColor(calibratedWhite: 0, alpha: 0.25).setFill()
        bounds.fill()
        if currentRect != .zero {
            NSColor(calibratedWhite: 0, alpha: 0).setFill()
            currentRect.fill(using: .copy)
            NSColor.systemYellow.setStroke()
            let path = NSBezierPath(rect: currentRect)
            path.lineWidth = 2
            path.stroke()
        }
    }

    override func mouseDown(with event: NSEvent) {
        startPoint = event.locationInWindow
        currentRect = NSRect(origin: startPoint!, size: .zero)
        needsDisplay = true
    }

    override func mouseDragged(with event: NSEvent) {
        guard let s = startPoint else { return }
        let p = event.locationInWindow
        currentRect = NSRect(
            x: min(s.x, p.x),
            y: min(s.y, p.y),
            width: abs(p.x - s.x),
            height: abs(p.y - s.y)
        )
        needsDisplay = true
    }

    override func mouseUp(with event: NSEvent) {
        guard currentRect.width > 5 && currentRect.height > 5 else { return }
        onDone?(currentRect)
    }

    override func keyDown(with event: NSEvent) {
        if event.keyCode == 53 { // Escape
            NSApp.terminate(nil)
        }
    }

    override var acceptsFirstResponder: Bool { true }
}

guard let screen = NSScreen.main else { exit(1) }

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

let window = NSWindow(
    contentRect: screen.frame,
    styleMask: [.borderless],
    backing: .buffered,
    defer: false,
    screen: screen
)
window.isOpaque = false
window.backgroundColor = .clear
window.level = .screenSaver
window.ignoresMouseEvents = false
window.hasShadow = false

let view = PickerView(frame: screen.frame)
window.contentView = view
window.makeKeyAndOrderFront(nil)
window.makeFirstResponder(view)
app.activate(ignoringOtherApps: true)

view.onDone = { rect in
    // AppKit y is from bottom; screencapture -R uses y from top.
    // Return in screencapture coordinates: x, y-from-top, width, height.
    let screenHeight = screen.frame.height
    let x = Int(rect.origin.x.rounded())
    let yTop = Int((screenHeight - rect.origin.y - rect.height).rounded())
    let w = Int(rect.width.rounded())
    let h = Int(rect.height.rounded())
    print("\(x) \(yTop) \(w) \(h)")
    exit(0)
}

app.run()
