import PySimpleGUI as sg
import pyautogui
import time
import threading

# Global control variable for pausing/resuming typing
pause_flag = threading.Event()
pause_flag.set()  # Initially set to allow typing

stop_typing = threading.Event()

def simulate_typing(content, key_delay, status_output):
    """Simulate typing the given content with a delay between keystrokes."""
    interval = key_delay / 1000.0  # Convert milliseconds to seconds

    status_output("Typing")
    for line in content.splitlines():
        if stop_typing.is_set():
            return
        for char in line:
            while not pause_flag.is_set():  # Pause if flag is cleared
                if stop_typing.is_set():
                    return  # Exit typing if stopped
                time.sleep(0.1)
            if stop_typing.is_set():
                return
            pyautogui.typewrite(char, interval=interval)
        pyautogui.press('enter')
    status_output("Ready")

def countdown(sleep_time, status_output):
    """Perform countdown before typing starts."""
    for i in range(sleep_time, 0, -1):
        if stop_typing.is_set():
            return  # Exit countdown if stopped
        status_output(f"Countdown: {i}s")
        time.sleep(1)

def resume_countdown(sleep_time, status_output):
    """Perform countdown before resuming typing."""
    for i in range(sleep_time, 0, -1):
        if stop_typing.is_set():
            return  # Exit countdown if stopped
        status_output(f"Resuming in: {i}s")
        time.sleep(1)

def main():
    global pause_flag, stop_typing

    # Define the layout for the GUI
    layout = [
        [sg.Text("Key Delay (ms):", font=("Helvetica", 14)), sg.InputText("100", size=(10, 1), key="key_delay", font=("Helvetica", 14))],
        [sg.Text("Sleep Time (s):", font=("Helvetica", 14)), sg.InputText("5", size=(10, 1), key="sleep_time", font=("Helvetica", 14))],
        [sg.Text("Text to Type:", font=("Helvetica", 14))],
        [sg.Multiline(size=(50, 10), key="content", font=("Helvetica", 14), expand_x=True, expand_y=True)],
        [sg.Text("Status:", size=(40, 1), key="status", text_color="blue", font=("Helvetica", 14), expand_x=True)],
        [sg.Button("Start Typing", font=("Helvetica", 14), key="Start", button_color=("white", "blue")),
         sg.Button("Pause", font=("Helvetica", 14), disabled=True, key="Pause", button_color=("white", "gray")),
         sg.Button("Exit", font=("Helvetica", 14), key="Exit", button_color=("white", "blue"))]
    ]

    # Create the window with resizable properties
    window = sg.Window("Typing Simulator", layout, finalize=True, resizable=True)

    def update_status(message):
        # Ensure updates happen in the GUI thread
        window.write_event_value("-STATUS-", message)

    update_status("Ready")

    typing_thread = None
    countdown_active = False
    typing_active = False
    resume_countdown_active = False

    def update_button_color(key, disabled):
        color = ("white", "gray") if disabled else ("white", "blue")
        window[key].update(disabled=disabled, button_color=color)

    while True:
        event, values = window.read(timeout=100)

        if event == sg.WINDOW_CLOSED or event == "Exit":
            stop_typing.set()
            pause_flag.set()  # Ensure the typing thread is not paused
            if typing_thread and typing_thread.is_alive():
                typing_thread.join()
            break

        if event == "-STATUS-":
            # Update the status text
            window["status"].update(values[event])

        if event == "Start":
            try:
                # Retrieve input values
                key_delay = int(values["key_delay"])
                sleep_time = int(values["sleep_time"])
                content = values["content"]

                if not content.strip():
                    update_status("Error: Content cannot be empty!")
                    continue

                # Start countdown and typing sequentially in separate threads
                def countdown_and_typing_task():
                    nonlocal countdown_active, typing_active
                    countdown_active = True
                    update_button_color("Start", True)
                    update_button_color("Exit", True)  # Disable Exit while typing
                    countdown(sleep_time, update_status)
                    if stop_typing.is_set():
                        update_button_color("Exit", False)  # Re-enable Exit if stopped
                        return
                    countdown_active = False
                    typing_active = True
                    update_status("Countdown complete")
                    update_button_color("Pause", False)
                    simulate_typing(content, key_delay, update_status)
                    typing_active = False
                    update_button_color("Start", False)
                    update_button_color("Exit", False)  # Re-enable Exit after typing

                stop_typing.clear()
                typing_thread = threading.Thread(target=countdown_and_typing_task, daemon=True)
                typing_thread.start()

                update_button_color("Pause", True)  # Disable Pause during countdown

            except ValueError:
                update_status("Error: Invalid input for key delay or sleep time.")

        if event == "Pause":
            sleep_time = int(values["sleep_time"])  # Use the same sleep time for resume countdown
            if pause_flag.is_set():
                pause_flag.clear()
                update_status("Paused")
                window["Pause"].update(text="Resume")
                update_button_color("Exit", False)  # Enable Exit when paused
            else:
                def resume_task():
                    nonlocal resume_countdown_active
                    resume_countdown_active = True
                    update_button_color("Pause", True)  # Disable Pause during resume countdown
                    resume_countdown(sleep_time, update_status)  # Countdown before resuming
                    resume_countdown_active = False
                    pause_flag.set()  # Resume typing
                    update_status("Typing")
                    update_button_color("Pause", False)  # Re-enable Pause after countdown

                window["Pause"].update(text="Pause")
                update_button_color("Exit", True)  # Disable Exit when resuming typing
                resume_thread = threading.Thread(target=resume_task, daemon=True)
                resume_thread.start()

        # Disable Pause button during resume countdown
        update_button_color("Pause", resume_countdown_active or not typing_active)

    window.close()

if __name__ == "__main__":
    main()
