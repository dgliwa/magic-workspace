#!/usr/bin/env python3
import gzip,http.cookiejar,json,re,sys,urllib.parse,urllib.request
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) Gecko/20100101 Firefox/128.0'
def read(r):
 b=r.read();return gzip.decompress(b) if r.headers.get('Content-Encoding','').lower()=='gzip' else b
def session(page):
 jar=http.cookiejar.CookieJar();op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar));req=urllib.request.Request(page,headers={'User-Agent':UA,'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8','Accept-Encoding':'gzip, deflate','Accept-Language':'en-US,en;q=0.9'});read(op.open(req,timeout=30));return op
def api(op,url,referer):
 req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'application/json,text/plain,*/*','Accept-Encoding':'gzip, deflate','Accept-Language':'en-US,en;q=0.9','Origin':'https://moxfield.com','Referer':referer});return json.loads(read(op.open(req,timeout=45)).decode())
def ident(value,kind):
 pattern=r'moxfield\.com/'+kind+r'/([^/?#]+)';m=re.search(pattern,value,re.I);value=(m.group(1) if m else value).strip()
 if not re.match(r'^[A-Za-z0-9_-]+$',value):raise ValueError('Invalid Moxfield identifier')
 return value
def deck(value):
 id=ident(value,'decks');page=f'https://moxfield.com/decks/{id}';op=session(page);data=None
 for version in ('v3','v2'):
  try:data=api(op,f'https://api2.moxfield.com/{version}/decks/all/{id}',page);break
  except Exception:pass
 if not data:raise RuntimeError('Deck not found')
 cards=[]
 for board in ('commanders','mainboard','sideboard','maybeboard'):
  for entry in ((data.get('boards') or {}).get(board) or {}).get('cards',{}).values():
   card=entry.get('card') or {};name=card.get('name')
   if name:cards.append({'name':name,'quantity':int(entry.get('quantity') or 1),'board':board,'scryfallId':card.get('scryfall_id'),'moxfieldCardId':card.get('id'),'set':card.get('set'),'collectorNumber':card.get('cn')})
 return {'publicId':data.get('publicId') or id,'internalId':data.get('id'),'name':data.get('name') or id,'format':data.get('format'),'url':data.get('publicUrl') or page,'updatedAt':data.get('lastUpdatedAtUtc'),'cards':cards,'source':'moxfield'}
def collection(value):
 id=ident(value,'collection');page=f'https://moxfield.com/collection/{id}';op=session(page);rows=[]
 for number in range(1,101):
  query=urllib.parse.urlencode({'pageNumber':number,'pageSize':1000,'sortType':'cardName','sortDirection':'ascending'});data=api(op,f'https://api2.moxfield.com/v1/collections/search/{id}?{query}',page)
  for item in data.get('data') or []:
   card=item.get('card') or {};qty=int(item.get('quantity') or 0)
   if card.get('name') and qty>0:rows.append({'name':card['name'],'count':qty,'tradelistCount':qty if item.get('tradeBinder') else 0,'edition':card.get('set'),'condition':item.get('condition'),'language':(item.get('language') or {}).get('name') or 'English','foil':item.get('finish')=='foil' or bool(item.get('isFoil')),'collectorNumber':card.get('cn'),'purchasePrice':item.get('purchasePrice')})
  if number>=int(data.get('totalPages') or 1):break
 return rows
if __name__=='__main__':
 try:
  mode,value=sys.argv[1:3];result=deck(value) if mode=='deck' else collection(value) if mode=='collection' else (_ for _ in ()).throw(ValueError('Unknown mode'));json.dump(result,sys.stdout,separators=(',',':'))
 except Exception as e:print(str(e),file=sys.stderr);sys.exit(1)
