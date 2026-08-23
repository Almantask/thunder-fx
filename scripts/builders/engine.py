# Generator Engine for Ambience Prompt Expansion
import os, re

DUR_I = [95, 110, 125, 140, 155, 170, 185, 200, 215, 230, 245, 260, 275, 290, 305, 320, 335, 350, 365, 380]
DUR_II = [50, 65, 70, 80, 95, 105, 115, 130, 145, 160, 175, 190, 205, 220, 240, 260, 280, 300, 315, 330]
DUR_III = [45, 55, 65, 75, 90, 105, 120, 135, 150, 165, 180, 200, 220, 240, 260, 280, 300, 320, 350, 380]
DUR_SINGLE = [50, 65, 80, 95, 110, 125, 140, 155, 170, 185, 200, 215, 230, 250, 270, 290, 310, 330, 350, 380]

NEG_DRY = 'speech, pop, EDM, trap, hip hop, rap, vocals, singing, lyrics, choir, drums, percussion'
NEG_CHOIR = 'speech, pop, EDM, trap, hip hop, rap, lyrics, singing, drums, percussion'
NEG_DRUMS = 'speech, pop, EDM, trap, hip hop, rap, vocals, singing, lyrics, choir'
NEG_FULL = 'speech, pop, EDM, trap, hip hop, rap, lyrics, singing'

def format_cue(title, duration, negative, prompt):
    return f'### {title}\n- Duration: {duration}s\n- Negative: {negative}\n\n{prompt}'

def apply_expansion_3levels(filepath, l1_cues, l2_cues, l3_cues):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    existing_cues = len(re.findall(r'(?m)^### ', content))
    if existing_cues >= 90:
        print(f'Already expanded ({existing_cues} cues): {filepath}')
        return

    p1 = re.search(r'(?m)^## I\s.*$', content)
    p2 = re.search(r'(?m)^## II\s.*$', content)
    p3 = re.search(r'(?m)^## III\s.*$', content)

    if not (p1 and p2 and p3):
        raise ValueError(f'File {filepath} does not have 3 standard level headers')

    header = content[:p1.start()].strip()
    sec1_header = p1.group(0).strip()
    sec1_body = content[p1.end():p2.start()].strip()

    sec2_header = p2.group(0).strip()
    sec2_body = content[p2.end():p3.start()].strip()

    sec3_header = p3.group(0).strip()
    sec3_body = content[p3.end():].strip()

    l1_formatted = '\n\n'.join([format_cue(c[0], c[1], c[2], c[3]) for c in l1_cues])
    l2_formatted = '\n\n'.join([format_cue(c[0], c[1], c[2], c[3]) for c in l2_cues])
    l3_formatted = '\n\n'.join([format_cue(c[0], c[1], c[2], c[3]) for c in l3_cues])

    new_content = f'{header}\n\n{sec1_header}\n\n{sec1_body}\n\n{l1_formatted}\n\n{sec2_header}\n\n{sec2_body}\n\n{l2_formatted}\n\n{sec3_header}\n\n{sec3_body}\n\n{l3_formatted}\n'

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f'Expanded 3-level file: {filepath} (now 90 cues)')

def apply_expansion_single(filepath, cues):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read().strip()

    existing_cues = len(re.findall(r'(?m)^### ', content))
    if existing_cues >= 30:
        print(f'Already expanded ({existing_cues} cues): {filepath}')
        return

    formatted = '\n\n'.join([format_cue(c[0], c[1], c[2], c[3]) for c in cues])
    new_content = f'{content}\n\n{formatted}\n'

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f'Expanded single-level file: {filepath} (now 30 cues)')
