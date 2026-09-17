from PIL import Image
import numpy as np
im=Image.open('dist/branding/design-mainline.png').convert('RGB');a=np.asarray(im);ys,xs=np.where(a.min(axis=2)<180);box=(max(0,int(xs.min())-4),max(0,int(ys.min())-4),min(im.width,int(xs.max())+5),min(im.height,int(ys.max())+5));im=im.crop(box);im=im.resize((1024,round(1024*im.height/im.width)),Image.Resampling.BILINEAR);a=np.asarray(im).astype(float);m=np.clip((230-a.min(axis=2))/80,0,1).astype('<f4');m.tofile('bottom-logo-mask.f32');print(m.shape)
