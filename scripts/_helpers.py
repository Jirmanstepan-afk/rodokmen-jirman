
def p(**kw):
    out = {
        "id": None, "name": None, "maiden": None,
        "birth": None, "baptism": None, "death": None,
        "occupation": None, "places": [], "branch": None,
        "certainty": "potvrzeno", "living": False,
        "sources": [], "notes": [], "interesting": [],
    }
    out.update(kw)
    return out

def d(display, date=None, place=None, precision="exact", note=None):
    x = {"display": display, "precision": precision}
    if date: x["date"] = date
    if place: x["place"] = place
    if note: x["note"] = note
    return x

def src(label, signatura=None, detail=None, apu=None):
    x = {"label": label}
    if signatura: x["signatura"] = signatura
    if detail: x["detail"] = detail
    if apu: x["apu"] = apu
    return x
