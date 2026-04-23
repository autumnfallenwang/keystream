import pyautogui
import time

def read_content(file_path):
    with open(file_path, 'r') as file:
        return file.read()

def simulate_typing(content, key_delay=100):
    # Convert key_delay from milliseconds to seconds for pyautogui
    interval = key_delay / 1000.0
    
    for line in content.splitlines():
        pyautogui.typewrite(line, interval=interval)
        pyautogui.press('enter')

def main():
    file_path = 'content.txt'
    key_delay = 80  # Delay between keystrokes in milliseconds
    print("Starting to simulate typing...")
    content = read_content(file_path)
    time.sleep(5)  # Gives you 5 seconds to switch to the target window
    simulate_typing(content, key_delay)
    print("Typing simulation completed.")

if __name__ == "__main__":
    main()

