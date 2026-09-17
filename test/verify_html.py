import urllib.request

html = urllib.request.urlopen('http://localhost:3000/index.html').read().decode('utf-8')
print('radar-blog in nav:', 'data-section="radar-blog"' in html)
print('section-radar-blog in body:', 'id="section-radar-blog"' in html)
print('radar-blog.js imported:', 'js/radar-blog.js' in html)
print('radar-blog.css imported:', 'css/radar-blog.css' in html)
