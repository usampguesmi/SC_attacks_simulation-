import sys

if len(sys.argv) != 3:
    print("Usage: python3 remove_third_field.py <input_file> <output_file>")
    sys.exit(1)

input_file = sys.argv[1]
output_file = sys.argv[2]

with open(input_file, "r", encoding="utf-8") as infile, \
     open(output_file, "w", encoding="utf-8") as outfile:

    for line in infile:
        line = line.strip().rstrip("',")

        if not line:
            continue

        parts = line.split(";")

        if len(parts) >= 2:
            outfile.write(f"{parts[0]};{parts[1]}\n")
        else:
            outfile.write(line + "\n")

print(f"Done! Output written to {output_file}")