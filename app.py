from flask import Flask, render_template, jsonify
import requests
import xml.etree.ElementTree as ET
import os

app = Flask(__name__)

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

# In-memory cache for fallback
cache = {
    "data": None,
}

def parse_feed(xml_text):
    try:
        root = ET.fromstring(xml_text)
        ns = {'atom': 'http://www.w3.org/2005/Atom'}
        
        entries = []
        for entry in root.findall('atom:entry', ns):
            title_el = entry.find('atom:title', ns)
            id_el = entry.find('atom:id', ns)
            updated_el = entry.find('atom:updated', ns)
            content_el = entry.find('atom:content', ns)
            
            # Find alternate link
            link_el = entry.find("atom:link[@rel='alternate']", ns)
            if link_el is None:
                link_el = entry.find("atom:link", ns)
            
            title = title_el.text if title_el is not None else "Unknown Date"
            id_val = id_el.text if id_el is not None else ""
            updated = updated_el.text if updated_el is not None else ""
            content = content_el.text if content_el is not None else ""
            link = link_el.attrib.get('href') if link_el is not None else ""
            
            entries.append({
                "title": title,
                "id": id_val,
                "updated": updated,
                "content": content,
                "link": link
            })
        return entries
    except Exception as e:
        print(f"Error parsing XML: {e}")
        return None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/release-notes')
def get_release_notes():
    try:
        # Fetch with a timeout to prevent hanging
        response = requests.get(FEED_URL, timeout=10)
        if response.status_code == 200:
            entries = parse_feed(response.text)
            if entries is not None:
                cache["data"] = entries
                return jsonify({
                    "success": True,
                    "source": "live",
                    "data": entries
                })
        
        if cache["data"] is not None:
            return jsonify({
                "success": True,
                "source": "cache",
                "data": cache["data"]
            })
            
        return jsonify({
            "success": False,
            "error": "Failed to fetch release notes from Google Cloud feed."
        }), 500
    except Exception as e:
        if cache["data"] is not None:
            return jsonify({
                "success": True,
                "source": "cache",
                "data": cache["data"]
            })
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

if __name__ == '__main__':
    # Run Flask on port 5000
    app.run(debug=True, host='127.0.0.1', port=5000)
