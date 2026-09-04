import sys
from pathlib import Path


def read_clean_lines(filename: str) -> list[str]:
    path = Path(filename)

    with path.open("r", encoding="utf-8") as file:
        return [
            line.strip()
            for line in file
            if line.strip()
        ]


def compare_files(file1: str, file2: str) -> None:
    lines1 = read_clean_lines(file1)
    lines2 = read_clean_lines(file2)

    if lines1 == lines2:
        print("✅ Files are identical.")
        return

    print("❌ Files are different.")

    max_length = max(len(lines1), len(lines2))

    for index in range(max_length):
        line1 = lines1[index] if index < len(lines1) else "<missing>"
        line2 = lines2[index] if index < len(lines2) else "<missing>"

        if line1 != line2:
            print(f"First difference at line {index + 1}:")
            print(f"File 1: {repr(line1)}")
            print(f"File 2: {repr(line2)}")
            return


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python3 compareFiles.py <file1> <file2>")
        sys.exit(1)

    compare_files(sys.argv[1], sys.argv[2])